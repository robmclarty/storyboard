import { describe, expect, test } from 'vitest';

import { readLog, readSlot, writeEntry, type Entry, type Question, type Slot, type SlotRow, type Stamp } from '../brief/index.js';
import { resume, turn, type Event, type Next, type Session } from '../turn.js';

const AT = '2026-10-28T10:00:00.000Z';

type Update = Extract<Entry, { kind: 'answered' }>['updates'][number];

/** A lens's slots from its table's rows. */
const lens = (name: string, rows: readonly SlotRow[]): Slot[] =>
  rows.map((row) => {
    const read = readSlot(name, row);
    if (!read.ok) {
      throw new Error(read.problem);
    }
    return read.value;
  });

const SLOTS: readonly Slot[] = [
  ...lens('frame', [
    { id: 'problem', holds: 'The problem it solves', impact: '3', lands: 'Intent' },
    { id: 'audience', holds: "Who it's for", impact: '3', lands: 'Intent' },
    { id: 'appetite', holds: "How much time it's worth", impact: '2', lands: 'Intent' },
    { id: 'no-gos', holds: 'What it must never do', impact: '2', lands: 'Constraints' },
  ]),
  ...lens('intent', [
    { id: 'principles', holds: 'What it holds to when two goods conflict', impact: '2', lands: 'Principles' },
    { id: 'decisions', holds: 'The calls made and why', impact: '3', lands: 'Decisions' },
    { id: 'taste', holds: 'How it should feel', impact: '1', lands: 'Taste' },
  ]),
];

/** A question about `slots`, open unless it has options. */
const question = (id: string, slots: readonly string[], options: readonly string[] = [], recommended: string | null = null): Question => ({
  id,
  slots,
  text: `What about ${slots.join(' and ')}?`,
  options,
  recommended,
});

const asked = (...questions: Question[]): Event => ({ kind: 'asked', questions });

/** Answers by question id, and the updates the model read from them. */
const answered = (answers: Readonly<Record<string, string>>, ...updates: Update[]): Event => ({
  kind: 'answered',
  answers: Object.entries(answers).map(([id, text]) => ({ question: id, text })),
  updates,
});

const clear = (slot: string, ...value: string[]): Update => ({ slot, status: 'clear', value });
const partial = (slot: string, ...value: string[]): Update => ({ slot, status: 'partial', value });

const INTAKE_QUESTIONS = [
  question('intake-1', ['problem', 'audience']),
  question('intake-2', ['appetite']),
  question('intake-3', ['no-gos']),
];

/** Intake: its three open questions, their answers, and a medium library. */
const INTAKE: readonly Event[] = [
  asked(...INTAKE_QUESTIONS),
  answered(
    { 'intake-1': 'A planner that interviews me.', 'intake-2': 'A month of evenings.', 'intake-3': 'Never touch the pilots.' },
    partial('problem', 'Plans lose what the person said.'),
    clear('audience', 'Rob.'),
    clear('appetite', 'A month of evenings.'),
    clear('no-gos', 'Never write into a pilot repo.'),
  ),
  { kind: 'classified', work: 'library', size: 'medium' },
];

/** The next steps where a call hands back: each waits on the person, or ends the session. */
const HANDS_BACK: readonly Next['kind'][] = ['answer', 'play', 'accept', 'accepted', 'no-planner'];

/**
 * The stamp the flow will give the next event: the first call starts the session, a new call starts
 * each time the session has handed back to the person, and a call carries on until it does.
 */
const stampFor = (session: Session): Stamp => ({
  call: session.call === 0 || HANDS_BACK.includes(session.next.kind) ? session.call + 1 : session.call,
  at: AT,
});

/**
 * Runs the events from a new session, each as one turn in the call the flow would take it in, and
 * keeps every entry and next step.
 */
const run = (events: readonly Event[], slots: readonly Slot[] = SLOTS) => {
  const started = resume(slots, []);
  if (!started.ok) {
    throw new Error(started.problem);
  }
  let session: Session = started.value;
  const entries: Entry[] = [];
  const nexts: Next[] = [session.next];
  for (const event of events) {
    const turned = turn(session, event, stampFor(session));
    if (!turned.ok) {
      throw new Error(`${event.kind}: ${turned.problem}`);
    }
    entries.push(turned.value.entry);
    nexts.push(turned.value.session.next);
    session = turned.value.session;
  }
  return { session, entries, nexts };
};

/** What a turn refuses after `before`, or undefined if it takes the event. */
const refused = (before: readonly Event[], event: Event): string | undefined => {
  const { session } = run(before);
  const turned = turn(session, event, stampFor(session));
  return turned.ok ? undefined : turned.problem;
};

/** The session after `entries`, resumed from them. */
const resumed = (entries: readonly Entry[]): Session => {
  const read = resume(SLOTS, entries);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

describe('a whole session, from intake to accepted', () => {
  const CHUNKS = ['## Intent\n\nA planner.', '## Decisions\n\n- **D1 (sqlite)**: One SQLite file.', '## Questions\n\n- **Q1 (taste)**: How should it feel?'];
  const CORRECTED = '## Decisions\n\n- **D1 (postgres)**: Postgres.';
  const EVENTS: readonly Event[] = [
    ...INTAKE,
    asked(question('q1', ['decisions'], ['SQLite', 'Postgres'], 'SQLite'), question('q2', ['principles'], [], 'Losing work is worse than being slow.'), question('q3', ['taste'])),
    answered({ q1: 'SQLite', q2: 'Yes.' }, clear('decisions', 'One SQLite file.'), clear('principles', 'Losing work is worse than being slow.')),
    asked(question('q4', ['problem'])),
    { kind: 'done' },
    { kind: 'drafted', chunks: CHUNKS },
    { kind: 'passed' },
    { kind: 'corrected', text: 'D1 should be Postgres.', items: ['D1'], updates: [partial('decisions', 'Postgres, probably.')] },
    { kind: 'passed' },
    { kind: 'drafted', chunks: [CHUNKS[0] ?? '', CORRECTED, CHUNKS[2] ?? ''] },
    { kind: 'passed' },
    { kind: 'accepted' },
  ];
  const { session, entries, nexts } = run(EVENTS);

  test('it walks intake, asking, drafting, playback and the accept, in that order', () => {
    expect(nexts.map((next) => next.kind)).toEqual([
      'intake',
      'answer',
      'classify',
      'ask',
      'answer',
      'ask',
      'answer',
      'draft',
      'play',
      'play',
      'play',
      'draft',
      'play',
      'accept',
      'accepted',
    ]);
  });

  test("intake asks the first lens's questions, then waits for their answers, then for the classification", () => {
    expect(nexts.slice(0, 3)).toEqual([{ kind: 'intake', lens: 'frame' }, { kind: 'answer', questions: INTAKE_QUESTIONS }, { kind: 'classify' }]);
  });

  test('the scheduler picks each round, and a round that closes with a question unanswered moves on', () => {
    expect(nexts[3]).toEqual({ kind: 'ask', lens: 'intent', slots: ['decisions', 'principles', 'taste'] });
    expect(nexts[5]).toEqual({ kind: 'ask', lens: 'frame', slots: ['problem'] });
  });

  test('"done" with a question waiting goes straight to the draft, every open slot an open Question', () => {
    const draft = nexts[7];
    expect(draft?.kind).toBe('draft');
    expect(draft?.kind === 'draft' && draft.open.map((open) => [open.slot.id, open.recommended])).toEqual([
      ['problem', null],
      ['taste', null],
    ]);
    expect(draft?.kind === 'draft' && [draft.previous, draft.corrections]).toEqual([null, []]);
  });

  test('a drafted event carries its chunks, and the turn plays them back one at a time', () => {
    expect(nexts.slice(8, 11)).toEqual(CHUNKS.map((text, chunk) => ({ kind: 'play', chunk, text })));
  });

  test('a correction is its own entry, keyed to its chunk, and reopens the slots it touches', () => {
    const correction = entries[9];
    expect(correction).toEqual({
      kind: 'corrected',
      call: 6,
      at: AT,
      chunk: 1,
      text: 'D1 should be Postgres.',
      items: ['D1'],
      updates: [partial('decisions', 'Postgres, probably.')],
    });
    const before = resumed(entries.slice(0, 9)).brief.slots.find((state) => state.slot.id === 'decisions');
    const after = resumed(entries.slice(0, 10)).brief.slots.find((state) => state.slot.id === 'decisions');
    expect([before?.status, after?.status]).toEqual(['clear', 'partial']);
  });

  test('after the last chunk, the redraft gets the draft before it and the corrections, word for word', () => {
    const redraft = nexts[11];
    expect(redraft?.kind === 'draft' && redraft.previous).toEqual(CHUNKS);
    expect(redraft?.kind === 'draft' && redraft.corrections).toEqual([{ chunk: 1, text: 'D1 should be Postgres.', items: ['D1'] }]);
    expect(redraft?.kind === 'draft' && redraft.open.map((open) => open.slot.id)).toEqual(['problem', 'decisions', 'taste']);
  });

  test('the next draft plays back again, only the chunks whose text changed, then asks for the accept', () => {
    expect(nexts.slice(12)).toEqual([{ kind: 'play', chunk: 1, text: CORRECTED }, { kind: 'accept' }, { kind: 'accepted' }]);
  });

  test('every turn returns the entry it adds: its event, stamped as given, with the chunk numbered', () => {
    expect(entries.map((entry) => entry.kind)).toEqual(EVENTS.map((event) => event.kind));
    expect(entries.every((entry) => entry.at === AT)).toBe(true);
    expect(entries.flatMap((entry) => (entry.kind === 'passed' || entry.kind === 'corrected' ? [entry.chunk] : []))).toEqual([0, 1, 2, 1]);
    expect(session.entries).toEqual(entries);
  });

  test('grouped by the call that wrote them, the entries give one exchange per call', () => {
    const calls = Map.groupBy(entries, (entry) => entry.call);
    expect([...calls.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...calls.values()].map((call) => call.map((entry) => entry.kind))).toEqual([
      ['asked'],
      ['answered', 'classified', 'asked'],
      ['answered', 'asked'],
      ['done', 'drafted'],
      ['passed'],
      ['corrected'],
      ['passed', 'drafted'],
      ['passed'],
      ['accepted'],
    ]);
    const handed = [...calls.values()].map((call) => resumed(entries.slice(0, entries.lastIndexOf(call.at(-1)!) + 1)).next.kind);
    expect(handed).toEqual(['answer', 'answer', 'answer', 'play', 'play', 'play', 'play', 'accept', 'accepted']);
  });

  test('replaying the entries gives the same brief and the same next step, after every turn', () => {
    for (const [count, next] of nexts.entries()) {
      const again = resumed(entries.slice(0, count));
      expect(again.next).toEqual(next);
    }
    expect(resumed(entries).brief).toEqual(session.brief);
  });

  test('the entries replay the same from their lines in the log', () => {
    const text = entries.map((entry) => {
      const line = writeEntry(entry);
      return line.ok ? line.value : '';
    }).join('');
    const read = readLog(text);
    expect(read.ok && read.value).toEqual(entries);
    const again = read.ok ? resumed(read.value) : undefined;
    expect([again?.brief, again?.next]).toEqual([session.brief, session.next]);
  });
});

describe('"done"', () => {
  test('in an asking turn with questions waiting, goes straight to the draft', () => {
    const { nexts } = run([...INTAKE, asked(question('q1', ['decisions'])), { kind: 'done' }]);
    expect(nexts.at(-2)?.kind).toBe('answer');
    expect(nexts.at(-1)?.kind).toBe('draft');
  });

  test('in an asking turn before the round is phrased, goes straight to the draft', () => {
    const { nexts } = run([...INTAKE, { kind: 'done' }]);
    expect(nexts.at(-2)?.kind).toBe('ask');
    expect(nexts.at(-1)?.kind).toBe('draft');
  });

  test("can't come during intake, before its answers are in", () => {
    expect(refused([asked(...INTAKE_QUESTIONS)], { kind: 'done' })).toBe('"done" can\'t come during intake: its answers come first');
  });

  test("can't come once the draft is being played back", () => {
    expect(refused([...INTAKE, { kind: 'done' }, { kind: 'drafted', chunks: ['x'] }], { kind: 'done' })).toContain(
      "can't come now: the session is waiting for a pass or a correction",
    );
  });
});

describe('a tiny classification', () => {
  const TINY: readonly Event[] = [...INTAKE.slice(0, 2), { kind: 'classified', work: 'feature', size: 'tiny' }];

  test('ends the session with "no planner needed"', () => {
    expect(run(TINY).nexts.at(-1)).toEqual({ kind: 'no-planner' });
  });

  test('takes nothing after it', () => {
    expect(refused(TINY, { kind: 'done' })).toBe('"done" can\'t come now: the session is waiting for nothing, since the work needs no planner');
  });

  test.each(['small', 'medium', 'large'] as const)('%s goes on to ask', (size) => {
    expect(run([...INTAKE.slice(0, 2), { kind: 'classified', work: 'feature', size }]).nexts.at(-1)?.kind).toBe('ask');
  });
});

describe('playback', () => {
  const DRAFTING: readonly Event[] = [...INTAKE, { kind: 'done' }];

  test('plays any chunks in order without reading them, then asks for the accept', () => {
    const chunks = ['anything at all', '🎬', 'What\'s wrong or missing?'];
    const { nexts } = run([...DRAFTING, { kind: 'drafted', chunks }, { kind: 'passed' }, { kind: 'passed' }, { kind: 'passed' }]);
    expect(nexts.slice(-4)).toEqual([...chunks.map((text, chunk) => ({ kind: 'play', chunk, text })), { kind: 'accept' }]);
  });

  test('a redraft plays only the chunks it changed, wherever they moved to', () => {
    const { nexts } = run([
      ...DRAFTING,
      { kind: 'drafted', chunks: ['a', 'b'] },
      { kind: 'passed' },
      { kind: 'corrected', text: 'Add c.', items: [], updates: [] },
      { kind: 'drafted', chunks: ['c', 'a', 'b'] },
    ]);
    expect(nexts.at(-1)).toEqual({ kind: 'play', chunk: 0, text: 'c' });
  });

  test('a redraft that changed nothing plays back whole', () => {
    const { nexts } = run([
      ...DRAFTING,
      { kind: 'drafted', chunks: ['a', 'b'] },
      { kind: 'corrected', text: 'Fix a.', items: [], updates: [] },
      { kind: 'passed' },
      { kind: 'drafted', chunks: ['a', 'b'] },
      { kind: 'passed' },
    ]);
    expect(nexts.slice(-2)).toEqual([
      { kind: 'play', chunk: 0, text: 'a' },
      { kind: 'play', chunk: 1, text: 'b' },
    ]);
  });

  test('a correction at the accept is keyed to the last chunk played, and sends the draft back', () => {
    const { entries, nexts } = run([
      ...DRAFTING,
      { kind: 'drafted', chunks: ['a', 'b'] },
      { kind: 'passed' },
      { kind: 'passed' },
      { kind: 'corrected', text: 'One more thing.', items: [], updates: [] },
    ]);
    expect(nexts.at(-2)).toEqual({ kind: 'accept' });
    expect(entries.at(-1)).toMatchObject({ kind: 'corrected', chunk: 1 });
    expect(nexts.at(-1)).toMatchObject({ kind: 'draft', previous: ['a', 'b'], corrections: [{ chunk: 1, text: 'One more thing.', items: [] }] });
  });
});

describe('a turn refuses an event that can\'t come now, and leaves the session as it was', () => {
  const ROUND: readonly Event[] = [...INTAKE];

  test.each<readonly [string, readonly Event[], Event, string]>([
    ['answers before anything is asked', [], answered({ 'intake-1': 'Hi.' }), '"answered" can\'t come now: the session is waiting for intake\'s questions'],
    ['an answer to a question not waiting', [asked(...INTAKE_QUESTIONS)], answered({ q9: 'Hi.' }), 'the question "q9" isn\'t waiting for an answer'],
    ['intake with four questions', [], asked(...INTAKE_QUESTIONS, question('intake-4', ['problem'])), 'intake asks three questions at most, and this asks 4'],
    ['intake with a menu', [], asked(question('intake-1', ['problem'], ['Yes', 'No'])), 'intake\'s questions are open, and "intake-1" has a menu'],
    ['intake about another lens', [], asked(question('intake-1', ['principles'])), 'intake asks about the frame lens, and "principles" isn\'t in it'],
    ['a classification before intake is answered', [asked(...INTAKE_QUESTIONS)], { kind: 'classified', work: 'game', size: 'small' }, "can't come now: the session is waiting for the person's answers"],
    ['a second classification', ROUND, { kind: 'classified', work: 'game', size: 'small' }, "can't come now: the session is waiting for the next round's questions"],
    ['a round about a slot it did not pick', ROUND, asked(question('q1', ['problem'])), 'the question "q1" asks about a slot this round didn\'t pick, which picked decisions, principles, taste'],
    ['a round asking about one slot twice', ROUND, asked(question('q1', ['decisions']), question('q2', ['decisions'])), 'two questions ask about "decisions", and a round asks one question a slot'],
    ['a round while answers are awaited', [...ROUND, asked(question('q1', ['decisions']))], asked(question('q2', ['taste'])), "can't come now: the session is waiting for the person's answers"],
    ['a draft while asking', ROUND, { kind: 'drafted', chunks: ['x'] }, "can't come now: the session is waiting for the next round's questions"],
    ['a pass before any draft', ROUND, { kind: 'passed' }, '"passed" can\'t come now'],
    ['an accept during playback', [...ROUND, { kind: 'done' }, { kind: 'drafted', chunks: ['x', 'y'] }], { kind: 'accepted' }, '"accepted" can\'t come now: the session is waiting for a pass or a correction on the chunk being played'],
    ['anything after the accept', [...ROUND, { kind: 'done' }, { kind: 'drafted', chunks: ['x'] }, { kind: 'passed' }, { kind: 'accepted' }], { kind: 'passed' }, 'waiting for nothing, since the draft was accepted'],
    ['an update to a slot no lens has', [asked(...INTAKE_QUESTIONS)], answered({ 'intake-1': 'Hi.' }, clear('scope', 'x')), 'an update names the slot "scope", which no lens has'],
    ['an event the log could not hold', [asked(...INTAKE_QUESTIONS)], answered({ 'intake-1': '   ' }), '"answers"[0].text isn\'t text'],
  ])('%s', (_name, before, event, problem) => {
    const { session } = run(before);
    const turned = turn(session, event, stampFor(session));
    expect(turned.ok ? undefined : turned.problem).toContain(problem);
    expect(resumed(session.entries)).toEqual(session);
  });
});

describe('resume', () => {
  test('a new session starts at intake, on the first lens', () => {
    expect(resumed([]).next).toEqual({ kind: 'intake', lens: 'frame' });
  });

  test('refuses a log whose entry could not have come when it did, naming its line', () => {
    const { entries } = run([...INTAKE, { kind: 'done' }]);
    expect(resume(SLOTS, [...entries.slice(0, 1), entries[3]!])).toEqual({
      ok: false,
      line: 2,
      problem: '"done" can\'t come during intake: its answers come first',
    });
    expect(resume(SLOTS, [entries[2]!])).toMatchObject({ ok: false, line: 1 });
  });

  test('refuses a pass about a chunk the playback is not at', () => {
    const { session, entries } = run([...INTAKE, { kind: 'done' }, { kind: 'drafted', chunks: ['a', 'b'] }]);
    expect(resume(SLOTS, [...entries, { kind: 'passed', ...stampFor(session), chunk: 1 }])).toEqual({
      ok: false,
      line: entries.length + 1,
      problem: 'the entry is about chunk 1, and the playback is at chunk 0',
    });
  });

  test('refuses a session with no slots', () => {
    expect(resume([], [])).toEqual({ ok: false, problem: 'a session needs a lens with slots' });
  });

  test('takes the caps it is given, and the session keeps them', () => {
    const read = resume(SLOTS, run(INTAKE).entries, { round: 1, lens: 5 });
    expect(read.ok && read.value.next).toEqual({ kind: 'ask', lens: 'intent', slots: ['decisions'] });
  });
});

describe('the call that wrote each entry', () => {
  const { session, entries } = run(INTAKE);

  test('a new session has no last call, and every turn gives the session the call it was stamped with', () => {
    expect(resumed([]).call).toBe(0);
    expect(entries.map((entry) => entry.call)).toEqual([1, 2, 2]);
    expect([session.call, resumed(entries).call]).toEqual([2, 2]);
  });

  test("a turn takes the session's last call, or the next one", () => {
    const event = asked(question('q1', ['decisions']));
    for (const call of [2, 3]) {
      const turned = turn(session, event, { call, at: AT });
      expect(turned.ok && [turned.value.entry.call, turned.value.session.call]).toEqual([call, call]);
    }
  });

  test.each<readonly [string, number, number, string]>([
    ['a call before the last', 2, 1, 'the entry is from call 1, after an entry from call 2'],
    ['a call past the next', 2, 4, 'the entry is from call 4, which skips call 3'],
    ['a first entry from any call but the first', 0, 2, 'the entry is from call 2, which skips call 1'],
  ])('a turn refuses %s, and leaves the session as it was', (_name, last, call, problem) => {
    const before = last === 0 ? resumed([]) : session;
    expect(turn(before, asked(question('q1', ['decisions'])), { call, at: AT })).toEqual({ ok: false, problem });
    expect(resumed(before.entries)).toEqual(before);
  });

  test('resume refuses an entry whose call is lower than the one before it, naming its line', () => {
    const [first, second, third] = entries;
    expect(resume(SLOTS, [first!, second!, { ...third!, call: 1 }])).toEqual({
      ok: false,
      line: 3,
      problem: 'the entry is from call 1, after an entry from call 2',
    });
  });

  test('resume refuses an entry whose call is more than one higher than the one before it, naming its line', () => {
    const [first, second] = entries;
    expect(resume(SLOTS, [first!, { ...second!, call: 3 }])).toEqual({
      ok: false,
      line: 2,
      problem: 'the entry is from call 3, which skips call 2',
    });
    expect(resume(SLOTS, [{ ...first!, call: 2 }])).toMatchObject({ ok: false, line: 1, problem: 'the entry is from call 2, which skips call 1' });
  });
});
