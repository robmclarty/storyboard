import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { run, type Io } from '../../src/cli.js';
import { fakeModels, type FakeModels, type Script } from '../helpers/fake-models.js';

// The Claude Code skill reads `storyboard turn --json` (D14 (skill-first)). Its table of kinds is
// the contract: this drives real turns through the CLI with the fake models edge, collects one
// object of every kind, and holds each to the fields the skill's table names, so the JSON and the
// skill that reads it can't drift apart without this failing.

const SKILL = readFileSync(new URL('../../skills/storyboard/SKILL.md', import.meta.url), 'utf8');

const ENV = {
  STORYBOARD_LOCAL_MODEL: 'qwen-test:1b',
  OLLAMA_HOST: 'mini.local',
  STORYBOARD_FRONTIER_MODEL: 'claude-test-1',
  ANTHROPIC_API_KEY: 'sk-test',
};

/** The skill's frontmatter fields, as `key: value` lines between the `---` fences. */
const frontmatter = (): ReadonlyMap<string, string> => {
  const [, block = ''] = /^---\n([\s\S]*?)\n---\n/.exec(SKILL) ?? [];
  return new Map(block.split('\n').map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]));
};

/** The names in backticks in `text`. */
const ticked = (text: string): readonly string[] => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');

/** A kind's fields as the skill's table names them: its own, and those of each item in a list field. */
type Fields = { readonly own: readonly string[]; readonly each: ReadonlyMap<string, readonly string[]> };

/** The skill's table of kinds: each kind, and the fields an object of that kind carries. */
const table = (): ReadonlyMap<string, Fields> => {
  const rows = SKILL.split('\n').filter((line) => /^\| `[a-z-]+` \|/.test(line));
  return new Map(
    rows.map((row) => {
      const [, kind = '', fields = ''] = row.split('|').map((cell) => cell.trim());
      const [own = '', each = ''] = fields.split(':');
      const owned = ticked(own);
      const list = owned.at(-1) ?? '';
      return [ticked(kind)[0] ?? '', { own: owned, each: new Map(each === '' ? [] : [[list, ticked(each)]]) }];
    }),
  );
};

/** One `storyboard turn --json` in `project`, with `stdin` piped in: its exit code and the object it printed. */
const turn = async (project: string, models: FakeModels, stdin = '', ...flags: string[]) => {
  let stdout = '';
  const io: Io = {
    stdout: (text) => {
      stdout += text;
    },
    stderr: () => undefined,
    stdin: () => Promise.resolve(stdin),
    env: ENV,
    cwd: project,
  };
  const code = await run(['turn', '--json', ...flags], io, { models: () => models, now: () => '2026-10-29T12:00:00.000Z' });
  expect(stdout.endsWith('\n')).toBe(true);
  expect(stdout.trim().split('\n')).toHaveLength(1);
  return { code, shown: JSON.parse(stdout) as Readonly<Record<string, unknown>> };
};

/** What the person says to an object: each question's recommended answer, or a pass on a chunk. */
const replyTo = (shown: Readonly<Record<string, unknown>>): string => {
  if (shown['kind'] === 'questions' && Array.isArray(shown['questions'])) {
    return JSON.stringify(
      Object.fromEntries(
        shown['questions'].map((question: { id: string; recommended: string | null }) => [question.id, question.recommended ?? 'In my own words.']),
      ),
    );
  }
  return shown['kind'] === 'chunk' ? JSON.stringify({ [String(shown['id'])]: '' }) : '';
};

/** A draft whose check fails, so its accept is refused. */
const FAILING: Script = {
  draft: [0, 1].map(() => ({
    intent: 'Notes for one person.',
    items: [{ section: 'principles' as const, slug: 'cites', text: 'Simple over complete, as [D9 (sync)] settles.', because: null }],
    open: [],
  })),
};

describe('storyboard turn --json, as the skill reads it', () => {
  const seen: { readonly code: number; readonly shown: Readonly<Record<string, unknown>> }[] = [];
  const projects: string[] = [];

  /** A fresh project folder, removed after the tests. */
  const folder = async (): Promise<string> => {
    const project = await mkdtemp(join(tmpdir(), 'storyboard-contract-'));
    projects.push(project);
    return project;
  };

  /** Drives a session in a new folder until the playback asks for the accept, keeping every object, then accepts. */
  const interview = async (script: Script): Promise<void> => {
    const project = await folder();
    const models = fakeModels(script);
    let last = await turn(project, models);
    for (let calls = 0; last.shown['kind'] !== 'accept' && calls < 40; calls += 1) {
      seen.push(last);
      last = await turn(project, models, replyTo(last.shown));
    }
    seen.push(last, await turn(project, models, '', '--accept'));
  };

  beforeAll(async () => {
    await interview({});
    await interview(FAILING);
    const tiny = await folder();
    const small = fakeModels({ classify: [{ work: 'feature', size: 'tiny' }] });
    await turn(tiny, small);
    seen.push(await turn(tiny, small, '{"intake-1": "Fix a typo.", "intake-2": "Now.", "intake-3": "Nothing."}'));
    seen.push(await turn(await folder(), fakeModels(), '{"intake-1": "Too soon."}'));
  });

  afterAll(async () => {
    await Promise.all(projects.map((project) => rm(project, { recursive: true, force: true })));
  });

  test('the skill runs only `storyboard turn`, and asks with AskUserQuestion', () => {
    const fields = frontmatter();
    expect(fields.get('name')).toBe('storyboard');
    expect(fields.get('allowed-tools')).toBe('Bash(storyboard turn:*), AskUserQuestion');
    expect(SKILL).toContain('storyboard turn --json');
  });

  test("every kind the skill's table names is one a turn prints, and no turn prints another", () => {
    expect([...new Set(seen.map(({ shown }) => String(shown['kind'])))].toSorted()).toEqual([...table().keys()].toSorted());
  });

  test("each object carries exactly the fields the skill's table names for its kind", () => {
    const kinds = table();
    for (const { shown } of seen) {
      const fields = kinds.get(String(shown['kind']));
      expect(Object.keys(shown).toSorted()).toEqual(['kind', ...(fields?.own ?? [])].toSorted());
      for (const [list, names] of fields?.each ?? []) {
        const items = shown[list];
        expect(Array.isArray(items)).toBe(true);
        for (const item of Array.isArray(items) ? items : []) {
          expect(Object.keys(item as object).toSorted()).toEqual([...names].toSorted());
        }
      }
    }
  });

  test('a question has a text id, its slots and options as lists of text, and a recommendation or null', () => {
    const questions = seen.flatMap(({ shown }) => (shown['kind'] === 'questions' && Array.isArray(shown['questions']) ? shown['questions'] : []));
    expect(questions.length).toBeGreaterThan(0);
    for (const { id, slots, text, options, recommended } of questions as Record<string, unknown>[]) {
      expect(typeof id).toBe('string');
      expect(typeof text).toBe('string');
      expect(Array.isArray(slots) && slots.every((slot) => typeof slot === 'string')).toBe(true);
      expect(Array.isArray(options) && options.every((option) => typeof option === 'string')).toBe(true);
      expect(recommended === null || typeof recommended === 'string').toBe(true);
    }
    const intake = questions.slice(0, 3) as Record<string, unknown>[];
    expect(intake.map((question) => [question['id'], question['options'], question['recommended']])).toEqual([
      ['intake-1', [], null],
      ['intake-2', [], null],
      ['intake-3', [], null],
    ]);
  });

  test("a chunk is replied to under its id, `chunk-` and its place, and ends with the playback's question", () => {
    const chunks = seen.filter(({ shown }) => shown['kind'] === 'chunk').map(({ shown }) => shown);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk['id']).toBe(`chunk-${String(chunk['place'])}`);
      expect(typeof chunk['of']).toBe('number');
      expect(String(chunk['text']).endsWith("What's wrong or missing?")).toBe(true);
    }
  });

  test('exit codes: 0 for a turn that ran, 1 for a refused accept, 2 for a turn that cannot go on', () => {
    const codes = new Map(seen.map(({ code, shown }) => [String(shown['kind']), code]));
    expect(Object.fromEntries(codes)).toEqual({ questions: 0, chunk: 0, accept: 0, accepted: 0, 'no-planner': 0, refused: 1, error: 2 });
  });
});
