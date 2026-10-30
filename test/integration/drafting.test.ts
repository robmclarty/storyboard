import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { readLog, type Entry, type Read } from '../../src/brief/index.js';
import { runTurn, type Request, type Shown } from '../../src/flow.js';
import { check } from '../../src/keyframes.js';
import type { Drafted } from '../../src/models/index.js';
import { fakeModels, type FakeModels } from '../helpers/fake-models.js';

// The half of the interview the person signs: from the last asking round to a draft, played back a
// chunk at a time, corrected, redrafted, and accepted into the project's `keyframes.md`, which the
// real `keyframes check --strict` passes (D4 (clean-to-accept), D19 (corrections-as-entries)). Then
// a draft whose errors survive the one redraft it gets, which the playback shows and the accept
// refuses, writing nothing. The models are the fake edge; the check is keyframes' own.

const AT = '2026-10-29T12:00:00.000Z';

const INTAKE = {
  'intake-1': 'A notes app, for me alone.',
  'intake-2': 'Find any note in two seconds. A few weekends of work.',
  'intake-3': 'Never send a note off my laptop.',
};

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** What a call shows, when it's of the kind `kind`, failing the test on anything else. */
const shownAs = <K extends Shown['kind']>(kind: K, read: Read<Shown>): Extract<Shown, { kind: K }> => {
  const shown = valueOf(read);
  if (shown.kind !== kind) {
    throw new Error(`expected ${kind}, and the call showed ${JSON.stringify(shown)}`);
  }
  return shown as Extract<Shown, { kind: K }>;
};

/** A project folder in a temp directory, and a way to run calls of the session "notes" in it. */
const session = () => {
  let project = '';
  const call = (models: FakeModels, request: Partial<Omit<Request, 'project' | 'slug'>> = {}): Promise<Read<Shown>> =>
    runTurn({ models, now: () => AT }, { project, slug: 'notes', answers: {}, done: false, accept: false, ...request });
  const log = async (): Promise<readonly Entry[]> =>
    valueOf(readLog(await readFile(join(project, '.storyboard', 'notes', 'answers.jsonl'), 'utf8')));
  return {
    call,
    log,
    dir: () => project,
    open: async () => {
      project = await mkdtemp(join(tmpdir(), 'storyboard-drafting-'));
    },
    close: () => rm(project, { recursive: true, force: true }),
  };
};

/** Answers every question shown with a plain answer naming its slots. */
const answersTo = (shown: Extract<Shown, { kind: 'questions' }>): Readonly<Record<string, string>> =>
  Object.fromEntries(shown.questions.map((question) => [question.id, `For ${question.slots.join(', ')}: settled.`]));

describe('from the last asking round to an accepted keyframes.md', () => {
  const s = session();
  const models = fakeModels();
  const played: Extract<Shown, { kind: 'chunk' }>[] = [];
  let firstDraft: readonly string[] = [];
  let correctedChunk = '';

  beforeAll(async () => {
    await s.open();
    // Intake, two intent rounds, then the frame's last question: the last asking round.
    let shown = shownAs('questions', await s.call(models));
    shown = shownAs('questions', await s.call(models, { answers: INTAKE }));
    shown = shownAs('questions', await s.call(models, { answers: answersTo(shown) }));
    shown = shownAs('questions', await s.call(models, { answers: answersTo(shown) }));
    expect(shown.questions.map((question) => question.id)).toEqual(['prior-art-4']);
    // Answering it leaves nothing worth asking, so the same call drafts and plays the first chunk.
    let chunk = shownAs('chunk', await s.call(models, { answers: answersTo(shown) }));
    firstDraft = (await s.log()).flatMap((entry) => (entry.kind === 'drafted' ? entry.chunks : []));
    // Each chunk is passed but the Decisions one, which is corrected; the correction is read into the slot it touches.
    for (;;) {
      played.push(chunk);
      const decisions = chunk.text.includes('## Decisions');
      if (decisions) {
        correctedChunk = chunk.text;
      }
      const reader = decisions ? fakeModels({ interpret: [[{ slot: 'decisions', status: 'clear', value: ['Notes live in one SQLite file, not one file each.'] }]] }) : models;
      const replied = await s.call(reader, { answers: { [chunk.id]: decisions ? 'D1 is wrong: it is one SQLite file, not a file each.' : '' } });
      const next = valueOf(replied);
      if (next.kind !== 'chunk' || next.place <= chunk.place) {
        played.push(...(next.kind === 'chunk' ? [next] : []));
        break;
      }
      chunk = next;
    }
  });

  afterAll(() => s.close());

  test('plays the draft back one chunk per call, in order, each ending with its question', () => {
    const first = played.slice(0, firstDraft.length);
    expect(first.map((chunk) => chunk.place)).toEqual(firstDraft.map((_, index) => index + 1));
    expect(first.map((chunk) => chunk.text)).toEqual(firstDraft);
    expect(first.every((chunk) => chunk.text.endsWith("What's wrong or missing?"))).toBe(true);
    expect(first.every((chunk) => chunk.of === firstDraft.length)).toBe(true);
  });

  test('logs the correction as its own entry, with the chunk and the items it names, and folds it into the brief', async () => {
    const corrected = (await s.log()).find((entry) => entry.kind === 'corrected');
    expect(corrected).toMatchObject({
      text: 'D1 is wrong: it is one SQLite file, not a file each.',
      chunk: firstDraft.indexOf(correctedChunk),
      items: ['D1'],
      updates: [{ slot: 'decisions', status: 'clear', value: ['Notes live in one SQLite file, not one file each.'] }],
    });
    expect(await readFile(join(s.dir(), '.storyboard', 'notes', 'brief.md'), 'utf8')).toContain('- Notes live in one SQLite file, not one file each.');
  });

  test('redrafts after the last chunk with the draft before and the correction word for word', () => {
    expect(models.calls.draft).toHaveLength(2);
    const redraft = models.calls.draft[1];
    expect(redraft?.previous).toContain('## Decisions');
    expect(redraft?.previous).not.toContain("What's wrong or missing?");
    expect(redraft?.corrections).toEqual([{ chunk: correctedChunk, text: 'D1 is wrong: it is one SQLite file, not a file each.', items: ['D1'] }]);
  });

  test('plays back only the chunk that changed', () => {
    const replayed = played.slice(firstDraft.length);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.text).toContain('Notes live in one SQLite file, not one file each.');
    expect(replayed[0]?.place).toBe(firstDraft.indexOf(correctedChunk) + 1);
  });

  test('asks for the accept once the replay is passed, then writes a keyframes.md that keyframes check --strict passes', async () => {
    const last = played.at(-1);
    shownAs('accept', await s.call(models, { answers: { [last?.id ?? '']: '' } }));
    expect(await readdir(s.dir())).toEqual(['.storyboard']);
    const accepted = shownAs('accepted', await s.call(models, { accept: true }));
    expect(accepted.path).toBe(join(s.dir(), 'keyframes.md'));
    expect(await readFile(accepted.path, 'utf8')).toBe(await readFile(join(s.dir(), '.storyboard', 'notes', 'draft', 'keyframes.md'), 'utf8'));
    expect(await check(s.dir())).toMatchObject({ kind: 'checked', exit: 0, errors: 0, warnings: 0 });
    expect((await s.log()).at(-1)?.kind).toBe('accepted');
    expect(shownAs('accepted', await s.call(models))).toEqual(accepted);
  });
});

/**
 * A draft that `keyframes check --strict` fails twice over: an item citing a decision the plan
 * doesn't have, which is an error, and an item past keyframes' 60 words, a warning `--strict` fails.
 */
const LONG: Drafted = {
  intent: 'A notes app for one person, kept on their laptop.',
  items: [
    { section: 'principles', slug: 'long', text: `Local over synced, ${'because it matters '.repeat(20)}`.trim(), because: null },
    { section: 'principles', slug: 'cites', text: 'Simple over complete, as [D9 (sync)] settles.', because: null },
  ],
  open: [],
};

describe('a draft whose errors outlast its redraft', () => {
  const s = session();

  beforeEach(() => s.open());
  afterEach(() => s.close());

  /** Runs intake and says done, so the next call drafts with `models`, and gives what that shows. */
  const draftWith = async (models: FakeModels): Promise<Read<Shown>> => {
    await s.call(models);
    return s.call(models, { answers: INTAKE, done: true });
  };

  /** Passes every chunk from `first` on, and gives what the call after the last one shows. */
  const passAll = async (models: FakeModels, first: Extract<Shown, { kind: 'chunk' }>): Promise<Shown> => {
    let shown: Shown = first;
    while (shown.kind === 'chunk') {
      shown = valueOf(await s.call(models, { answers: { [shown.id]: '' } }));
    }
    return shown;
  };

  test('goes back to the model once with the failing draft and its findings', async () => {
    const models = fakeModels({ draft: [LONG, LONG] });
    shownAs('chunk', await draftWith(models));
    expect(models.calls.draft).toHaveLength(2);
    expect(models.calls.draft[0]?.findings).toEqual([]);
    expect(models.calls.draft[1]?.previous).toContain('**P1 (long)**');
    expect(models.calls.draft[1]?.findings.map((finding) => finding.code)).toContain('over-budget');
  });

  test('a redraft that comes back clean is played back with nothing found', async () => {
    const models = fakeModels({ draft: [LONG] });
    shownAs('chunk', await draftWith(models));
    const chunks = (await s.log()).flatMap((entry) => (entry.kind === 'drafted' ? entry.chunks : []));
    expect(chunks.some((chunk) => chunk.startsWith('## What keyframes check found'))).toBe(false);
  });

  test('plays what the check found as a chunk of its own, and refuses the accept, writing nothing', async () => {
    const models = fakeModels({ draft: [LONG, LONG] });
    const first = shownAs('chunk', await draftWith(models));
    const chunks = (await s.log()).flatMap((entry) => (entry.kind === 'drafted' ? entry.chunks : []));
    const found = chunks.at(-1) ?? '';
    expect(found).toMatch(/^## What keyframes check found\n\nThis draft can't be accepted until each of these is settled: keyframes check found 1 error and 1 warning in it\.\n\n/);
    expect(found).toMatch(/- Line \d+, error \(broken-citation\): /);
    expect(found).toMatch(/- Line \d+, warning \(over-budget\): P1's text has 63 words/);
    expect(found.endsWith("What's wrong or missing?")).toBe(true);
    expect((await passAll(models, first)).kind).toBe('accept');
    const refused = shownAs('refused', await s.call(models, { accept: true }));
    expect(refused.problem).toMatch(/^the draft can't be accepted: keyframes check found 1 error and 1 warning in it\n- Line \d+, /);
    expect(refused.problem).toContain('(broken-citation)');
    expect(refused.problem).toContain('(over-budget)');
    expect(await readdir(s.dir())).toEqual(['.storyboard']);
    expect((await s.log()).some((entry) => entry.kind === 'accepted')).toBe(false);
  });

  test("refuses an accept over a keyframes.md that's already there", async () => {
    const models = fakeModels();
    const first = shownAs('chunk', await draftWith(models));
    expect((await passAll(models, first)).kind).toBe('accept');
    await writeFile(join(s.dir(), 'keyframes.md'), '# mine\n');
    const refused = shownAs('refused', await s.call(models, { accept: true }));
    expect(refused.problem).toContain("there's already a keyframes.md");
    expect(await readFile(join(s.dir(), 'keyframes.md'), 'utf8')).toBe('# mine\n');
  });

  test('refuses an accept before the playback is over, and a reply under the wrong chunk', async () => {
    const models = fakeModels();
    const first = shownAs('chunk', await draftWith(models));
    expect(await s.call(models, { accept: true })).toEqual({
      ok: false,
      problem: "there's no draft to accept yet: the playback has to end with nothing corrected, and the session is at play",
    });
    expect(await s.call(models, { answers: { 'chunk-9': 'Wrong.' } })).toEqual({
      ok: false,
      problem: `a reply to the playback goes under the id of the chunk being played, ${first.id}, and nothing else: this was chunk-9`,
    });
    expect(shownAs('chunk', await s.call(models))).toEqual(first);
  });
});
