import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { readLog, renderBrief, replay, type Entry, type Read, type Slot } from '../../src/brief/index.js';
import { runTurn, type Request, type Shown } from '../../src/flow.js';
import { NO_PLANNER } from '../../src/intake.js';
import { LENSES, loadLenses } from '../../src/lens.js';
import { resume } from '../../src/turn.js';
import { fakeModels, type FakeModels } from '../helpers/fake-models.js';

// An interview from its first call through intake, the classification and two intent rounds, in a
// temp directory standing in for the project, with the fake models edge (D9 (models-injected)).
// Each call is one `storyboard turn`; the session lives only in its files between them. Then the
// calls that stop short: what each refuses, and what it keeps on disk for the next call.

const AT = '2026-10-29T12:00:00.000Z';

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(`${read.problem}${read.line === undefined ? '' : ` (line ${read.line})`}`);
  }
  return read.value;
};

/** The problem a read refused with, failing the test on a value. */
const problemOf = (read: Read<Shown>): string => {
  if (read.ok) {
    throw new Error(`expected a refusal, and the call showed ${read.value.kind}`);
  }
  return read.problem;
};

/** The questions a call shows, failing the test on anything else. */
const questionsOf = (shown: Shown | undefined): Extract<Shown, { kind: 'questions' }> => {
  if (shown?.kind !== 'questions') {
    throw new Error(`expected questions, and the call showed ${shown?.kind ?? 'nothing'}`);
  }
  return shown;
};

describe('an interview from intake through two intent rounds', () => {
  const models = fakeModels();
  const shown: Shown[] = [];
  let project = '';
  let slots: readonly Slot[] = [];

  /** Runs one call with these answers, and keeps what it showed. */
  const call = async (answers: Readonly<Record<string, string>> = {}): Promise<void> => {
    shown.push(valueOf(await runTurn({ models, now: () => AT }, { project, slug: 'inkwell', answers, done: false, accept: false })));
  };

  /** The session's log, as it's stored. */
  const log = async (): Promise<readonly Entry[]> =>
    valueOf(readLog(await readFile(join(project, '.storyboard', 'inkwell', 'answers.jsonl'), 'utf8')));

  beforeAll(async () => {
    project = await mkdtemp(join(tmpdir(), 'storyboard-asking-'));
    slots = valueOf(await loadLenses(LENSES, ['frame', 'intent'])).flatMap((lens) => lens.slots);
    await call();
    await call({
      'intake-1': 'A notes app, for me alone.',
      'intake-2': 'I can find any note in two seconds. A few weekends of work.',
      'intake-3': 'Never send a note off my laptop.',
    });
    await call(Object.fromEntries(questionsOf(shown[1]).questions.map((question) => [question.id, `About ${question.slots.join(', ')}: yes.`])));
    await call(Object.fromEntries(questionsOf(shown[2]).questions.map((question) => [question.id, 'Whether to sync. Lean: no.'])));
  });

  afterAll(async () => {
    await rm(project, { recursive: true, force: true });
  });

  test("the first call asks intake's three open questions, from the frame lens", () => {
    const first = questionsOf(shown[0]);
    expect(first.lens).toBe('frame');
    expect(first.questions.map((question) => [question.id, question.text, question.options, question.recommended])).toEqual([
      ['intake-1', "What is it, and who's it for?", [], null],
      ['intake-2', 'What would make it a success, and how much time is it worth?', [], null],
      ['intake-3', 'What must it never do?', [], null],
    ]);
  });

  test("intake's answers are classified by the local model, word for word", () => {
    expect(models.calls.classify).toEqual([
      [
        { asked: "What is it, and who's it for?", about: ['problem', 'audience'], answer: 'A notes app, for me alone.' },
        { asked: 'What would make it a success, and how much time is it worth?', about: ['done', 'appetite'], answer: 'I can find any note in two seconds. A few weekends of work.' },
        { asked: 'What must it never do?', about: ['no-gos'], answer: 'Never send a note off my laptop.' },
      ],
    ]);
  });

  test("the first intent round asks four questions, highest impact first, phrased from the bank", () => {
    const round = questionsOf(shown[1]);
    expect(round.lens).toBe('intent');
    expect(round.questions.map((question) => question.id)).toEqual(['principles-2', 'decisions-2', 'constraints-2', 'taste-2']);
    expect(round.questions.every((question) => question.recommended !== null)).toBe(true);
    expect(models.calls.phrase[0]?.round).toEqual(['principles', 'decisions', 'constraints', 'taste']);
    expect(models.calls.phrase[0]?.bank.every((question) => question.slots.some((slot) => models.calls.phrase[0]?.round.includes(slot)))).toBe(true);
  });

  test('the second intent round asks the one question left in the lens', () => {
    expect(questionsOf(shown[2]).questions.map((question) => question.id)).toEqual(['questions-3']);
  });

  test('with the intent lens asked five times, the frame asks about its last open slot', () => {
    const round = questionsOf(shown[3]);
    expect(round.lens).toBe('frame');
    expect(round.questions.map((question) => question.id)).toEqual(['prior-art-4']);
  });

  test("interpret is given every slot with its Clear line, and each answer with what it was asked", () => {
    const first = models.calls.interpret[0];
    expect(first?.slots.map((slot) => slot.id)).toEqual(slots.map((slot) => slot.id));
    expect(first?.slots.every((slot) => slot.clear !== '')).toBe(true);
    const menu = models.calls.interpret[1]?.said.find((said) => said.about.includes('principles'));
    expect(menu?.asked).toContain('Options: ');
    expect(menu?.asked).toContain('Recommended: ');
  });

  test('the log holds one exchange per call, each entry stamped with the call that wrote it', async () => {
    const byCall = Map.groupBy(await log(), (entry) => entry.call);
    expect([...byCall].map(([callNumber, entries]) => [callNumber, entries.map((entry) => entry.kind)])).toEqual([
      [1, ['asked']],
      [2, ['answered', 'classified', 'asked']],
      [3, ['answered', 'asked']],
      [4, ['answered', 'asked']],
    ]);
  });

  test('replaying the stored log gives the brief the calls rendered, and the same next round', async () => {
    const entries = await log();
    const brief = valueOf(replay(slots, entries));
    expect(await readFile(join(project, '.storyboard', 'inkwell', 'brief.md'), 'utf8')).toBe(renderBrief(brief));
    expect(brief.work).toBe('product');
    expect(brief.slots.filter((state) => state.status === 'clear').map((state) => state.slot.id)).toEqual([
      'problem',
      'audience',
      'appetite',
      'no-gos',
      'done',
      'principles',
      'constraints',
      'decisions',
      'taste',
      'questions',
    ]);
    const next = valueOf(resume(slots, entries)).next;
    expect(next).toEqual({ kind: 'answer', questions: questionsOf(shown[3]).questions });
  });

  test('a call with no answers shows the waiting round again, and writes nothing', async () => {
    const before = await log();
    await call();
    expect(shown.at(-1)).toEqual(shown[3]);
    expect(await log()).toEqual(before);
  });
});

describe('a call that stops short', () => {
  const INTAKE = {
    'intake-1': 'A notes app, for me alone.',
    'intake-2': 'Find any note in two seconds. A few weekends.',
    'intake-3': 'Never send a note off my laptop.',
  };

  let project = '';

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'storyboard-asking-'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  /** Runs one call of the session "inkwell" with the fake `models`. */
  const call = (models: FakeModels, request: Partial<Omit<Request, 'project' | 'slug'>> = {}): Promise<Read<Shown>> =>
    runTurn({ models, now: () => AT }, { project, slug: 'inkwell', answers: {}, done: false, accept: false, ...request });

  /** The session's log as it's stored, or none before its first write. */
  const log = async (): Promise<readonly Entry[]> =>
    valueOf(readLog(await readFile(join(project, '.storyboard', 'inkwell', 'answers.jsonl'), 'utf8').catch(() => '')));

  /** The kinds of the log's entries, in order. */
  const kinds = async (): Promise<readonly string[]> => (await log()).map((entry) => entry.kind);

  test('ends a tiny piece of work with no planner, and keeps saying so', async () => {
    const models = fakeModels({ classify: [{ work: 'feature', size: 'tiny' }] });
    await call(models);
    const ended = await call(models, { answers: INTAKE });
    expect(ended).toEqual({ ok: true, value: { kind: 'no-planner', message: NO_PLANNER, work: 'feature', size: 'tiny' } });
    expect(await call(models)).toEqual(ended);
    expect(models.calls.phrase).toEqual([]);
    expect(await kinds()).toEqual(['asked', 'answered', 'classified']);
  });

  test('refuses answers when nothing is waiting for them, and writes nothing', async () => {
    const models = fakeModels();
    expect(problemOf(await call(models, { answers: { 'intake-1': 'Hello.' } }))).toBe(
      "no questions are waiting for answers, so these can't be taken: intake-1",
    );
    expect(await readdir(project)).toEqual([]);
    expect(models.calls.interpret).toEqual([]);
  });

  test('refuses an answer to a question that is not waiting, before any model is called', async () => {
    const models = fakeModels();
    await call(models);
    expect(problemOf(await call(models, { answers: { 'taste-1': 'Quiet.' } }))).toBe(
      'the question "taste-1" isn\'t waiting for an answer: the questions waiting are intake-1, intake-2, intake-3',
    );
    expect(models.calls.interpret).toEqual([]);
    expect(await kinds()).toEqual(['asked']);
  });

  test('takes no blank answer, so a round of blanks shows the round again', async () => {
    const models = fakeModels();
    const first = await call(models);
    expect(await call(models, { answers: { 'intake-1': '  ', 'intake-2': '' } })).toEqual(first);
    expect(await kinds()).toEqual(['asked']);
  });

  test('refuses "done" during intake', async () => {
    const models = fakeModels();
    await call(models);
    expect(problemOf(await call(models, { done: true }))).toBe("\"done\" can't come during intake: its answers come first");
    expect(await kinds()).toEqual(['asked']);
  });

  test('takes "done" at the first round it can, asks nothing more, and drafts', async () => {
    const models = fakeModels();
    await call(models);
    const shown = await call(models, { answers: INTAKE, done: true });
    expect(await kinds()).toEqual(['asked', 'answered', 'classified', 'done', 'drafted']);
    expect(models.calls.phrase).toEqual([]);
    expect(shown.ok && shown.value.kind).toBe('chunk');
  });

  test('keeps nothing of answers the model could not read, so the same answers can be sent again', async () => {
    const models = fakeModels({ interpret: [{ fail: "interpret, on the frontier model c: it couldn't be reached: fetch failed" }] });
    await call(models);
    expect(problemOf(await call(models, { answers: INTAKE }))).toBe("interpret, on the frontier model c: it couldn't be reached: fetch failed");
    expect(await kinds()).toEqual(['asked']);
    const again = await call(models, { answers: INTAKE });
    expect(again.ok && again.value.kind).toBe('questions');
    expect(await kinds()).toEqual(['asked', 'answered', 'classified', 'asked']);
  });

  test('keeps the answers when the classification fails, and classifies on the next call', async () => {
    const models = fakeModels({ classify: [{ fail: 'classify, on the local model q: its reply stopped before it was whole (length)' }] });
    await call(models);
    expect(problemOf(await call(models, { answers: INTAKE }))).toContain('classify, on the local model q');
    expect(await kinds()).toEqual(['asked', 'answered']);
    expect(await readFile(join(project, '.storyboard', 'inkwell', 'brief.md'), 'utf8')).toContain('### problem: Clear');
    const resumed = await call(models);
    expect(resumed.ok && resumed.value.kind).toBe('questions');
    expect((await log()).map((entry) => [entry.call, entry.kind])).toEqual([
      [1, 'asked'],
      [2, 'answered'],
      [3, 'classified'],
      [3, 'asked'],
    ]);
  });

  test('refuses a log that does not read, naming the file and the line', async () => {
    await mkdir(join(project, '.storyboard', 'inkwell'), { recursive: true });
    await writeFile(join(project, '.storyboard', 'inkwell', 'answers.jsonl'), 'not json\n');
    expect(problemOf(await call(fakeModels()))).toBe("answers.jsonl, line 1: the line isn't JSON");
  });
});
