import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readLog, renderBrief, replay, type Read } from '../../src/brief/index.js';
import { run, type Io } from '../../src/cli.js';
import type { Shown } from '../../src/flow.js';
import { check } from '../../src/keyframes.js';
import { LENSES, loadLenses } from '../../src/lens.js';
import { resume } from '../../src/turn.js';
import { fakeModels, type FakeModels } from '../helpers/fake-models.js';

// A whole interview through the command line, as a front end drives it: one `storyboard turn
// --json` per call, the answers piped in, until the person accepts (D10 (one-turn-command)). The
// models are the fake edge (D9 (models-injected)); the session lives only in its files between
// calls, so replaying them at the end must give back the brief the last call left.

const ENV = {
  STORYBOARD_LOCAL_MODEL: 'qwen-test:1b',
  OLLAMA_HOST: 'mini.local',
  STORYBOARD_FRONTIER_MODEL: 'claude-test-1',
  ANTHROPIC_API_KEY: 'sk-test',
};

/** The most calls an interview may take before the test calls it stuck. */
const CALLS = 40;

let project = '';

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'storyboard-e2e-'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

/** Runs `storyboard turn --json` in the project with `stdin` piped in, and gives the exit code and what it showed. */
const turn = async (models: FakeModels, stdin: string, ...flags: string[]): Promise<{ readonly code: number; readonly shown: Shown }> => {
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
  const code = await run(['turn', 'notes', '--json', ...flags], io, { models: () => models, now: () => '2026-10-29T12:00:00.000Z' });
  return { code, shown: JSON.parse(stdout) as Shown };
};

/** What the person says to what they're shown: an answer to each question, or a pass on a chunk. */
const replyTo = (shown: Shown): string => {
  if (shown.kind === 'questions') {
    return JSON.stringify(Object.fromEntries(shown.questions.map((question) => [question.id, question.recommended ?? `About ${question.slots.join(' and ')}: plainly.`])));
  }
  return shown.kind === 'chunk' ? JSON.stringify({ [shown.id]: '' }) : '';
};

/** Drives the interview from its first call until it asks for the accept, and gives every kind it showed. */
const toAccept = async (models: FakeModels): Promise<readonly Shown['kind'][]> => {
  const kinds: Shown['kind'][] = [];
  let { code, shown } = await turn(models, '');
  for (let calls = 1; shown.kind !== 'accept'; calls += 1) {
    expect(code).toBe(0);
    expect(calls).toBeLessThan(CALLS);
    kinds.push(shown.kind);
    ({ code, shown } = await turn(models, replyTo(shown)));
  }
  return kinds;
};

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

describe('a whole interview through storyboard turn', () => {
  test('runs from the first call to an accepted keyframes.md, and the session replays', async () => {
    const models = fakeModels();
    const kinds = await toAccept(models);
    expect(kinds[0]).toBe('questions');
    expect(kinds).toContain('chunk');

    const accepted = await turn(models, '', '--accept');
    expect(accepted).toEqual({ code: 0, shown: { kind: 'accepted', path: join(project, 'keyframes.md') } });
    expect(await check(project)).toMatchObject({ kind: 'checked', exit: 0 });

    const slots = valueOf(await loadLenses(LENSES, ['frame', 'intent'])).flatMap((lens) => lens.slots);
    const entries = valueOf(readLog(await readFile(join(project, '.storyboard', 'notes', 'answers.jsonl'), 'utf8')));
    expect(await readFile(join(project, '.storyboard', 'notes', 'brief.md'), 'utf8')).toBe(renderBrief(valueOf(replay(slots, entries))));
    expect(valueOf(resume(slots, entries)).next).toEqual({ kind: 'accepted' });
    expect(entries.at(-1)?.call).toBe(kinds.length + 2);
  });

  test('exits 1 on an accept its check refuses, and writes nothing', async () => {
    const long = { section: 'principles' as const, slug: 'long', text: `Local over synced, ${'because it matters '.repeat(20)}`.trim(), because: null };
    const models = fakeModels({ draft: [{ intent: 'Notes for one person.', items: [long], open: [] }, { intent: 'Notes for one person.', items: [long], open: [] }] });
    await toAccept(models);
    const refused = await turn(models, '', '--accept');
    expect(refused.code).toBe(1);
    expect(refused.shown).toMatchObject({ kind: 'refused' });
    await expect(readFile(join(project, 'keyframes.md'), 'utf8')).rejects.toThrow();
  });
});
