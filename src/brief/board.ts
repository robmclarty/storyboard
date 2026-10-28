import type { Entry, Question, Size, Status, Update, Work } from './log.js';
import type { Read } from './read.js';
import type { Slot } from './slot.js';

/** A slot as the log leaves it: the slot board's row for it. */
export type SlotState = {
  readonly slot: Slot;
  readonly status: Status;
  /** Its short statements, and none while it's Missing. */
  readonly value: readonly string[];
  /** How many questions have asked about it. */
  readonly asked: number;
  /** What the latest question about it that recommended an answer recommended, or null. */
  readonly recommended: string | null;
};

/** The brief: every slot as the log leaves it, what's been asked, and intake's read of the work. */
export type Brief = {
  /** The slot board, in the order the slots were given. */
  readonly slots: readonly SlotState[];
  /** Every question asked, in the order it was asked. */
  readonly questions: readonly Question[];
  /** The work's kind and size, or null until intake classifies it. */
  readonly work: Work | null;
  readonly size: Size | null;
};

/** A brief being replayed: each slot by id, with the fields the log changes. */
type Replaying = {
  readonly slots: Map<string, { slot: Slot; status: Status; value: readonly string[]; asked: number; recommended: string | null }>;
  readonly questions: Map<string, Question>;
  work: Work | null;
  size: Size | null;
};

/** Why an entry can't be replayed onto the brief so far, or undefined when it can. */
const problemWith = (brief: Replaying, entry: Entry): string | undefined => {
  const unknown = (ids: readonly string[]): string | undefined => ids.find((id) => !brief.slots.has(id));
  const updates = (list: readonly Update[]): string | undefined => {
    const slot = unknown(list.map((update) => update.slot));
    return slot === undefined ? undefined : `an update names the slot "${slot}", which no lens has`;
  };
  switch (entry.kind) {
    case 'asked':
      return entry.questions.map((question) => problemWithQuestion(brief, question)).find((found) => found !== undefined);
    case 'answered': {
      const unasked = entry.answers.find((answer) => !brief.questions.has(answer.question));
      return unasked === undefined
        ? updates(entry.updates)
        : `an answer is to the question "${unasked.question}", which was never asked`;
    }
    case 'corrected':
      return updates(entry.updates);
    default:
      return undefined;
  }
};

/** Why a question can't be asked of the brief so far, or undefined when it can. */
const problemWithQuestion = (brief: Replaying, question: Question): string | undefined => {
  if (brief.questions.has(question.id)) {
    return `the question "${question.id}" was asked before`;
  }
  const slot = question.slots.find((id) => !brief.slots.has(id));
  if (slot !== undefined) {
    return `the question "${question.id}" asks about the slot "${slot}", which no lens has`;
  }
  const lenses = new Set(question.slots.map((id) => brief.slots.get(id)?.slot.lens));
  return lenses.size > 1 ? `the question "${question.id}" asks about slots in more than one lens` : undefined;
};

/** Applies an entry's updates: each replaces its slot's status and value whole. */
const update = (brief: Replaying, updates: readonly Update[]): void => {
  for (const { slot, status, value } of updates) {
    const state = brief.slots.get(slot);
    if (state !== undefined) {
      state.status = status;
      state.value = value;
    }
  }
};

/** Records each question as asked, counting it against its slots and keeping its recommendation. */
const ask = (brief: Replaying, questions: readonly Question[]): void => {
  for (const question of questions) {
    brief.questions.set(question.id, question);
    for (const id of question.slots) {
      const state = brief.slots.get(id);
      if (state !== undefined) {
        state.asked += 1;
        state.recommended = question.recommended ?? state.recommended;
      }
    }
  }
};

/** Applies one entry to the brief being replayed. Entries about the draft don't change the brief. */
const apply = (brief: Replaying, entry: Entry): void => {
  switch (entry.kind) {
    case 'asked':
      ask(brief, entry.questions);
      break;
    case 'answered':
    case 'corrected':
      update(brief, entry.updates);
      break;
    case 'classified':
      brief.work = entry.work;
      brief.size = entry.size;
      break;
    default:
      break;
  }
};

/**
 * Replays the answers log onto the lenses' slots, giving the brief. Every slot starts Missing,
 * never asked and with no recommendation. The same slots and the same log always give the same
 * brief. An entry that names a slot no lens has, answers a question never asked or asks one twice
 * is refused with its line, counting the first entry as line 1.
 */
export const replay = (slots: readonly Slot[], entries: readonly Entry[]): Read<Brief> => {
  const twice = slots.find((slot, index) => slots.findIndex((other) => other.id === slot.id) !== index);
  if (twice !== undefined) {
    return { ok: false, problem: `two slots are called "${twice.id}"` };
  }
  const brief: Replaying = {
    slots: new Map(slots.map((slot) => [slot.id, { slot, status: 'missing', value: [], asked: 0, recommended: null }])),
    questions: new Map(),
    work: null,
    size: null,
  };
  for (const [index, entry] of entries.entries()) {
    const problem = problemWith(brief, entry);
    if (problem !== undefined) {
      return { ok: false, line: index + 1, problem };
    }
    apply(brief, entry);
  }
  return {
    ok: true,
    value: {
      slots: [...brief.slots.values()].map((state) => ({ ...state })),
      questions: [...brief.questions.values()],
      work: brief.work,
      size: brief.size,
    },
  };
};
