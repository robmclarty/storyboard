import { readSlot, type Entry, type Slot, type SlotRow } from '../index.js';

/** The time every entry in these tests was written at. */
export const AT = '2026-10-28T10:00:00.000Z';

/** A lens's slots, read from its table's rows; a row that doesn't read fails the test that uses it. */
const lens = (name: string, rows: readonly SlotRow[]): Slot[] =>
  rows.map((row) => {
    const read = readSlot(name, row);
    if (!read.ok) {
      throw new Error(read.problem);
    }
    return read.value;
  });

/** Two small lenses, frame then intent, standing in for the real ones in `lenses/`. */
export const SLOTS: readonly Slot[] = [
  ...lens('frame', [
    { id: 'problem', holds: 'The problem it solves', impact: '3', lands: 'Intent' },
    { id: 'audience', holds: "Who it's for", impact: '3', lands: 'Intent' },
    { id: 'no-gos', holds: 'What it must never do', impact: '2', lands: 'Constraints' },
  ]),
  ...lens('intent', [
    { id: 'principles', holds: 'What it holds to when two goods conflict', impact: '2', lands: 'Principles' },
    { id: 'decisions', holds: 'The calls made, the options considered and why', impact: '3', lands: 'Decisions' },
  ]),
];

/** A short interview: intake, one round on the frame lens, a draft, a correction and an accept. */
export const SESSION: readonly Entry[] = [
  {
    kind: 'asked',
    call: 1,
    at: AT,
    questions: [
      { id: 'intake-1', slots: ['problem', 'audience'], text: "What is it, and who's it for?", options: [], recommended: null },
      { id: 'intake-3', slots: ['no-gos'], text: 'What must it never do?', options: [], recommended: null },
    ],
  },
  {
    kind: 'answered',
    call: 2,
    at: AT,
    answers: [
      { question: 'intake-1', text: 'A planner that interviews me, for me and agents.' },
      { question: 'intake-3', text: '  Never touch the pilot repos.  ' },
    ],
    updates: [
      { slot: 'problem', status: 'partial', value: ['Plans written by hand lose what was said.'] },
      { slot: 'audience', status: 'partial', value: ['Rob.', 'Coding agents that read the plan.'] },
      { slot: 'no-gos', status: 'clear', value: ['Never run in, draft for or write into a pilot repo.'] },
    ],
  },
  { kind: 'classified', call: 2, at: AT, work: 'library', size: 'medium' },
  {
    kind: 'asked',
    call: 2,
    at: AT,
    questions: [
      {
        id: 'q3',
        slots: ['audience'],
        text: 'Who reads the plan first?',
        options: ['The owner', 'A coding agent', 'A reviewer'],
        recommended: 'The owner',
      },
      { id: 'q4', slots: ['problem'], text: 'What goes wrong today?', options: [], recommended: 'Decisions get guessed.' },
    ],
  },
  {
    kind: 'answered',
    call: 3,
    at: AT,
    answers: [{ question: 'q3', text: 'The owner' }],
    updates: [{ slot: 'audience', status: 'clear', value: ['Rob, as the owner who signs the plan.'] }],
  },
  { kind: 'done', call: 3, at: AT },
  { kind: 'drafted', call: 3, at: AT, chunks: ['## Intent\n\nA planner.\n\nWhat\'s wrong or missing?'] },
  {
    kind: 'corrected',
    call: 4,
    at: AT,
    chunk: 0,
    text: 'The problem is guessed decisions, not lost words.',
    items: [],
    updates: [{ slot: 'problem', status: 'clear', value: ['Agents guess decisions a person never made.'] }],
  },
  { kind: 'drafted', call: 4, at: AT, chunks: ['## Intent\n\nA planner that never guesses.\n\nWhat\'s wrong or missing?'] },
  { kind: 'passed', call: 5, at: AT, chunk: 0 },
  { kind: 'accepted', call: 6, at: AT },
];
