import { describe, expect, test } from 'vitest';

import { readSlot, replay, type Brief, type Entry, type Question, type Slot } from '../brief/index.js';
import { CAPS, schedule, score, type Next } from '../scheduler.js';

type Status = Brief['slots'][number]['status'];

/** A slot of `lens`, read from a table row that lands in `lands`. */
const slot = (lens: string, id: string, impact: string, lands = 'Intent'): Slot => {
  const read = readSlot(lens, { id, holds: `What ${id} holds`, impact, lands });
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** A slot on the board: its lens, id, impact and status, and its recommended default. */
type Row = readonly [lens: string, id: string, impact: string, status: Status, recommended?: string];

/** A brief whose board is `rows`, in order, and whose lenses have been asked `asks` questions. */
const brief = (rows: readonly Row[], asks: Readonly<Record<string, number>> = {}): Brief => ({
  slots: rows.map(([lens, id, impact, status, recommended]) => ({
    slot: slot(lens, id, impact),
    status,
    value: status === 'missing' ? [] : [`Something about ${id}.`],
    asked: 0,
    recommended: recommended ?? null,
  })),
  questions: Object.entries(asks).flatMap(([lens, count]) =>
    Array.from(
      { length: count },
      (_, n): Question => ({
        id: `${lens}-${n}`,
        slots: [rows.find(([owner]) => owner === lens)?.[1] ?? ''],
        text: 'Why?',
        options: [],
        recommended: null,
      }),
    ),
  ),
  work: null,
  size: null,
});

/** What the scheduler picks for a brief, with the plan's caps unless others are given. */
const next = (of: Brief, { done = false, caps = CAPS } = {}): Next => schedule(of, { done, caps });

describe('score', () => {
  test.each([
    ['3', 'missing', 3],
    ['3', 'partial', 1.5],
    ['3', 'clear', 0],
    ['2', 'missing', 2],
    ['2', 'partial', 1],
    ['2', 'clear', 0],
    ['1', 'missing', 1],
    ['1', 'partial', 0.5],
    ['1', 'clear', 0],
  ] as const)('impact %s and %s score %d', (impact, status, expected) => {
    const [state] = brief([['frame', 'problem', impact, status]]).slots;
    expect(state && score(state)).toBe(expected);
  });
});

describe('schedule: what to ask', () => {
  test.each<readonly [string, readonly Row[], Next]>([
    [
      'the highest score is asked first',
      [
        ['frame', 'a', '1', 'missing'],
        ['frame', 'b', '3', 'partial'],
        ['frame', 'c', '2', 'missing'],
        ['frame', 'd', '3', 'missing'],
      ],
      { kind: 'ask', lens: 'frame', slots: ['d', 'c', 'b', 'a'] },
    ],
    [
      'equal scores keep the slot order',
      [
        ['frame', 'b', '2', 'missing'],
        ['frame', 'a', '2', 'missing'],
        ['frame', 'c', '3', 'partial'],
      ],
      { kind: 'ask', lens: 'frame', slots: ['b', 'a', 'c'] },
    ],
    [
      'an equal top score goes to the first lens',
      [
        ['frame', 'a', '2', 'missing'],
        ['intent', 'x', '2', 'missing'],
      ],
      { kind: 'ask', lens: 'frame', slots: ['a'] },
    ],
    [
      'the lens order is the order the brief gives',
      [
        ['intent', 'x', '2', 'missing'],
        ['frame', 'a', '2', 'missing'],
      ],
      { kind: 'ask', lens: 'intent', slots: ['x'] },
    ],
    [
      'a round asks one lens, the one holding the top slot',
      [
        ['frame', 'a', '2', 'missing'],
        ['frame', 'b', '2', 'missing'],
        ['intent', 'x', '3', 'missing'],
        ['intent', 'y', '1', 'missing'],
      ],
      { kind: 'ask', lens: 'intent', slots: ['x', 'y'] },
    ],
    [
      'a slot at the floor is worth asking, and one below it is not',
      [
        ['frame', 'a', '1', 'partial'],
        ['frame', 'b', '2', 'partial'],
        ['frame', 'c', '1', 'missing'],
        ['frame', 'd', '3', 'clear'],
      ],
      { kind: 'ask', lens: 'frame', slots: ['b', 'c'] },
    ],
    [
      'a round holds four questions at most',
      [
        ['frame', 'a', '3', 'missing'],
        ['frame', 'b', '3', 'missing'],
        ['frame', 'c', '3', 'missing'],
        ['frame', 'd', '3', 'missing'],
        ['frame', 'e', '3', 'missing'],
        ['frame', 'f', '3', 'missing'],
      ],
      { kind: 'ask', lens: 'frame', slots: ['a', 'b', 'c', 'd'] },
    ],
  ])('%s', (_name, rows, expected) => {
    expect(next(brief(rows))).toEqual(expected);
  });

  const SIX: readonly Row[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ['frame', id, '3', 'missing'] as const);
  const TWO_LENSES: readonly Row[] = [...SIX, ['intent', 'x', '1', 'missing']];

  test.each<readonly [string, Readonly<Record<string, number>>, Next]>([
    ['a lens with three asked has room for two', { frame: 3 }, { kind: 'ask', lens: 'frame', slots: ['a', 'b'] }],
    ['a lens with four asked has room for one', { frame: 4 }, { kind: 'ask', lens: 'frame', slots: ['a'] }],
    ['a lens asked five times is passed over for the next', { frame: 5 }, { kind: 'ask', lens: 'intent', slots: ['x'] }],
    ['a lens past its cap is passed over too', { frame: 6 }, { kind: 'ask', lens: 'intent', slots: ['x'] }],
    ["another lens's questions don't count against this one", { intent: 5 }, { kind: 'ask', lens: 'frame', slots: ['a', 'b', 'c', 'd'] }],
  ])('%s', (_name, asks, expected) => {
    expect(next(brief(TWO_LENSES, asks))).toEqual(expected);
  });

  test("intake's three questions count against the frame lens's five (D17 (intake-counts))", () => {
    expect(next(brief(SIX, { frame: 3 }))).toEqual({ kind: 'ask', lens: 'frame', slots: ['a', 'b'] });
  });

  test.each<readonly [string, { round: number; lens: number }, Readonly<Record<string, number>>, readonly string[]]>([
    ['a smaller round cap', { round: 2, lens: 5 }, {}, ['a', 'b']],
    ['a larger round cap', { round: 6, lens: 10 }, {}, ['a', 'b', 'c', 'd', 'e', 'f']],
    ['a larger lens cap', { round: 4, lens: 7 }, { frame: 5 }, ['a', 'b']],
    ['a smaller lens cap', { round: 4, lens: 3 }, { frame: 1 }, ['a', 'b']],
  ])('both caps are arguments: %s', (_name, caps, asks, slots) => {
    expect(next(brief(TWO_LENSES, asks), { caps })).toEqual({ kind: 'ask', lens: 'frame', slots });
  });
});

describe('schedule: when to draft', () => {
  test('once no slot scores at the floor', () => {
    const rows: readonly Row[] = [
      ['frame', 'a', '3', 'clear'],
      ['frame', 'b', '1', 'partial'],
      ['intent', 'x', '2', 'clear'],
    ];
    expect(next(brief(rows))).toMatchObject({ kind: 'draft' });
  });

  test('once the person has said done, however much is still worth asking', () => {
    expect(next(brief([['frame', 'a', '3', 'missing']]), { done: true })).toMatchObject({ kind: 'draft' });
  });

  test('once every slot worth asking about is in a lens at its cap', () => {
    const rows: readonly Row[] = [
      ['frame', 'a', '3', 'missing'],
      ['intent', 'x', '3', 'partial'],
    ];
    expect(next(brief(rows, { frame: 5, intent: 5 }))).toMatchObject({ kind: 'draft' });
  });

  test('every slot still open comes back as an open Question with its recommended default, never as its own section', () => {
    const rows: readonly Row[] = [
      ['frame', 'problem', '3', 'clear'],
      ['frame', 'appetite', '1', 'partial', 'A weekend'],
      ['intent', 'decisions', '3', 'missing', 'One SQLite file'],
      ['intent', 'taste', '1', 'missing'],
    ];
    const of = brief(rows);
    expect(next(of, { done: true })).toEqual({
      kind: 'draft',
      open: [
        { section: 'questions', slot: of.slots[1]?.slot, value: ['Something about appetite.'], recommended: 'A weekend' },
        { section: 'questions', slot: of.slots[2]?.slot, value: [], recommended: 'One SQLite file' },
        { section: 'questions', slot: of.slots[3]?.slot, value: [], recommended: null },
      ],
    });
  });

  test('a slot that lands in Decisions is still an open Question while it is open', () => {
    const of: Brief = {
      ...brief([]),
      slots: [{ slot: slot('intent', 'storage', '3', 'Decisions'), status: 'partial', value: ['Maybe SQLite.'], asked: 2, recommended: 'SQLite' }],
    };
    const drafted = next(of, { done: true });
    expect(drafted.kind === 'draft' && drafted.open.map((open) => [open.section, open.slot.lands, open.recommended])).toEqual([
      ['questions', 'decisions', 'SQLite'],
    ]);
  });

  test('a brief with every slot Clear drafts with no open Questions', () => {
    expect(next(brief([['frame', 'a', '3', 'clear']]))).toEqual({ kind: 'draft', open: [] });
  });
});

describe('schedule over a whole session', () => {
  test('when nothing is ever answered, it asks each lens to its cap a round at a time, then drafts', () => {
    const slots = ['frame', 'intent'].flatMap((lens) => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => slot(lens, `${lens}-${id}`, '2')));
    const log: Entry[] = [];
    const rounds: Array<readonly [string, number]> = [];
    for (let turn = 0; turn < 10; turn += 1) {
      const read = replay(slots, log);
      if (!read.ok) {
        throw new Error(read.problem);
      }
      const picked = schedule(read.value, { done: false, caps: CAPS });
      if (picked.kind === 'draft') {
        expect(picked.open).toHaveLength(12);
        break;
      }
      rounds.push([picked.lens, picked.slots.length]);
      log.push({
        kind: 'asked',
        at: '2026-10-28T10:00:00.000Z',
        questions: picked.slots.map((id) => ({ id: `q${log.length}-${id}`, slots: [id], text: 'Why?', options: [], recommended: null })),
      });
    }
    expect(rounds).toEqual([
      ['frame', 4],
      ['frame', 1],
      ['intent', 4],
      ['intent', 1],
    ]);
  });
});
