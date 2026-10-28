import { describe, expect, test } from 'vitest';

import { readLog, replay, writeEntry, type Brief, type Entry, type Question } from '../index.js';
import { AT, SESSION, SLOTS } from './fixture.js';

/** The brief a log replays into; a log that won't replay fails the test. */
const brief = (entries: readonly Entry[]): Brief => {
  const read = replay(SLOTS, entries);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** Each slot's row on the board, by id: its status, value, asks and recommendation. */
const board = (entries: readonly Entry[]) =>
  Object.fromEntries(
    brief(entries).slots.map(({ slot, status, value, asked, recommended }) => [slot.id, { status, value, asked, recommended }]),
  );

/** An asked entry of questions, each about the slots given and recommending what's given. */
const asked = (...questions: ReadonlyArray<readonly [id: string, slots: readonly string[], recommended: string | null]>): Entry => ({
  kind: 'asked',
  call: 1,
  at: AT,
  questions: questions.map(([id, slots, recommended]): Question => ({ id, slots, text: `${id}?`, options: [], recommended })),
});

/** An answer to q1 that reads `value` into the principles slot. */
const update = (value: string[]): Entry => ({
  kind: 'answered',
  call: 1,
  at: AT,
  answers: [{ question: 'q1', text: 'Yes.' }],
  updates: [{ slot: 'principles', status: value.length === 0 ? 'missing' : 'partial', value }],
});

/** An answer to `question` with one update, to `slot`. */
const answer = (question: string, slot = 'problem'): Entry => ({
  kind: 'answered',
  call: 1,
  at: AT,
  answers: [{ question, text: 'Yes.' }],
  updates: [{ slot, status: 'partial', value: ['x'] }],
});

/** What replaying a log refuses, as its line and problem. */
const refusal = (entries: readonly Entry[]) => {
  const read = replay(SLOTS, entries);
  return read.ok ? undefined : { line: read.line, problem: read.problem };
};

describe('replay', () => {
  test('before anything is asked, every slot is Missing, never asked, and recommends nothing', () => {
    const empty = { status: 'missing', value: [], asked: 0, recommended: null };
    expect(board([])).toEqual({ problem: empty, audience: empty, 'no-gos': empty, principles: empty, decisions: empty });
    expect(brief([])).toMatchObject({ questions: [], work: null, size: null });
  });

  test('a session gives each slot its status, its value, its asks and its latest recommended default', () => {
    expect(board(SESSION)).toEqual({
      problem: {
        status: 'clear',
        value: ['Agents guess decisions a person never made.'],
        asked: 2,
        recommended: 'Decisions get guessed.',
      },
      audience: { status: 'clear', value: ['Rob, as the owner who signs the plan.'], asked: 2, recommended: 'The owner' },
      'no-gos': { status: 'clear', value: ['Never run in, draft for or write into a pilot repo.'], asked: 1, recommended: null },
      principles: { status: 'missing', value: [], asked: 0, recommended: null },
      decisions: { status: 'missing', value: [], asked: 0, recommended: null },
    });
  });

  test('the brief keeps the slots in the order given, every question asked, and the classification', () => {
    const replayed = brief(SESSION);
    expect(replayed.slots.map((state) => state.slot)).toEqual(SLOTS);
    expect(replayed.questions.map((question) => question.id)).toEqual(['intake-1', 'intake-3', 'q3', 'q4']);
    expect([replayed.work, replayed.size]).toEqual(['library', 'medium']);
  });

  test('an update replaces the whole value, so a statement can be dropped or added', () => {
    const start = [asked(['q1', ['principles'], null])];
    expect(board([...start, update(['a', 'b'])])['principles']?.value).toEqual(['a', 'b']);
    expect(board([...start, update(['a', 'b']), update(['b', 'c'])])['principles']?.value).toEqual(['b', 'c']);
    expect(board([...start, update(['a']), update([])])['principles']).toMatchObject({ status: 'missing', value: [] });
  });

  test('the latest recommendation wins, and a question without one keeps the one before', () => {
    const log = [
      asked(['q1', ['decisions'], 'SQLite']),
      asked(['q2', ['decisions'], 'Postgres']),
      asked(['q3', ['decisions'], null]),
    ];
    expect(board(log)['decisions']).toMatchObject({ asked: 3, recommended: 'Postgres' });
  });

  test('a question about two slots counts once against each', () => {
    expect(board([asked(['q1', ['problem', 'audience'], 'Rob'])])).toMatchObject({
      problem: { asked: 1, recommended: 'Rob' },
      audience: { asked: 1, recommended: 'Rob' },
      'no-gos': { asked: 0, recommended: null },
    });
  });

  test("the draft, its playback and the accept don't change the board", () => {
    const asking = SESSION.slice(0, 5);
    const after: Entry[] = [
      { kind: 'done', call: 1, at: AT },
      { kind: 'drafted', call: 1, at: AT, chunks: ['x'] },
      { kind: 'passed', call: 1, at: AT, chunk: 0 },
      { kind: 'accepted', call: 1, at: AT },
    ];
    expect(brief([...asking, ...after])).toEqual(brief(asking));
  });

  test('the same log always gives the same board, read from its lines or not', () => {
    const text = SESSION.map((entry) => {
      const line = writeEntry(entry);
      return line.ok ? line.value : '';
    }).join('');
    const read = readLog(text);
    expect(read.ok).toBe(true);
    const fromLines = read.ok ? brief(read.value) : undefined;
    expect(fromLines).toEqual(brief(SESSION));
    expect(brief(SESSION)).toEqual(brief(SESSION));
    expect(brief(structuredClone(SESSION))).toEqual(brief(SESSION));
  });

  test('replay leaves the log and the slots as they were', () => {
    const log = structuredClone(SESSION);
    const slots = structuredClone(SLOTS);
    replay(slots, log);
    expect(log).toEqual(SESSION);
    expect(slots).toEqual(SLOTS);
  });
});

describe('replay refuses an entry the brief so far rules out, naming its line', () => {
  test.each([
    ['an answer to a question never asked', [asked(['q1', ['problem'], null]), answer('q2')], 2, 'an answer is to the question "q2", which was never asked'],
    ['an update to a slot no lens has', [asked(['q1', ['problem'], null]), answer('q1', 'scope')], 2, 'an update names the slot "scope", which no lens has'],
    [
      'a correction to a slot no lens has',
      [{ kind: 'corrected', call: 1, at: AT, chunk: 0, text: 'No.', items: [], updates: [{ slot: 'scope', status: 'clear', value: ['x'] }] }],
      1,
      'an update names the slot "scope", which no lens has',
    ],
    ['a question about a slot no lens has', [asked(['q1', ['problem', 'scope'], null])], 1, 'the question "q1" asks about the slot "scope", which no lens has'],
    ['a question asked twice', [asked(['q1', ['problem'], null]), asked(['q1', ['audience'], null])], 2, 'the question "q1" was asked before'],
    ['a question across two lenses', [asked(['q1', ['problem'], null], ['q2', ['no-gos', 'decisions'], null])], 1, 'the question "q2" asks about slots in more than one lens'],
  ] as const)('%s', (_name, entries, line, problem) => {
    expect(refusal(entries)).toEqual({ line, problem });
  });

  test('two slots with one id are refused before any entry', () => {
    const read = replay([...SLOTS, { ...SLOTS[0]!, lens: 'intent' }], []);
    expect(read).toEqual({ ok: false, problem: 'two slots are called "problem"' });
  });
});
