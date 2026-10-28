import type { Brief, Slot } from './brief/index.js';

// The scheduler picks what to ask next, or says it's time to draft. It's the plain scheduler of
// D13 (fixed-weights): a slot's score is its impact times how uncertain the brief is about it, and
// a slot is worth asking about while that's at least 1.

type SlotState = Brief['slots'][number];

/** The most questions one round holds, and the most a lens is asked in all (C9 (caps)). */
export type Caps = { readonly round: number; readonly lens: number };

/** The caps the plan sets: four questions a round and five a lens, intake's three included. */
export const CAPS: Caps = { round: 4, lens: 5 };

/** How uncertain the brief is about a slot in each status. */
const UNCERTAINTY: Readonly<Record<SlotState['status'], number>> = { clear: 0, partial: 0.5, missing: 1 };

/** The score a slot needs to be worth a question. */
const FLOOR = 1;

/** A slot's score: its impact, 1 to 3, times its uncertainty, 0 for Clear, ½ for Partial and 1 for Missing. */
export const score = (state: SlotState): number => state.slot.impact * UNCERTAINTY[state.status];

/**
 * A slot still open when the scheduler answers "draft". It lands as an open Question with its
 * recommended default beside it, whichever section the slot itself lands in, so it's never a
 * guessed Decision (C5 (open-not-guessed), D18 (open-becomes-question)).
 */
export type OpenQuestion = {
  readonly section: 'questions';
  readonly slot: Slot;
  /** What the brief knows of it so far, which is nothing while it's Missing. */
  readonly value: readonly string[];
  /** Its latest recommended default, or null when no question about it recommended one. */
  readonly recommended: string | null;
};

/** What comes next: a round about one lens's slots, highest score first, or the draft. */
export type Scheduled =
  | { readonly kind: 'ask'; readonly lens: string; readonly slots: readonly string[] }
  | { readonly kind: 'draft'; readonly open: readonly OpenQuestion[] };

/** How many questions each lens has been asked: each question counts once, against its slots' lens. */
const askedByLens = (brief: Brief): ReadonlyMap<string, number> => {
  const lensOf = new Map(brief.slots.map((state) => [state.slot.id, state.slot.lens]));
  const asked = new Map<string, number>();
  for (const question of brief.questions) {
    const lens = lensOf.get(question.slots[0] ?? '');
    if (lens !== undefined) {
      asked.set(lens, (asked.get(lens) ?? 0) + 1);
    }
  }
  return asked;
};

/** Every slot that isn't Clear, in the board's order, as an open Question. */
const openQuestions = (brief: Brief): readonly OpenQuestion[] =>
  brief.slots
    .filter((state) => state.status !== 'clear')
    .map(({ slot, value, recommended }) => ({ section: 'questions', slot, value, recommended }));

/**
 * Picks the next round, or the draft. The round asks about one lens: the one holding the
 * top-scoring slot whose lens is under its cap. It holds that lens's slots worth asking about,
 * highest score first, one question each, up to the round's cap and what's left of the lens's.
 * Ties break by lens order, then slot order, both as the brief gives them. Once the person has
 * said done, or no slot under a cap is worth asking about, it answers "draft" with every slot
 * still open.
 */
export const schedule = (brief: Brief, { done, caps }: { readonly done: boolean; readonly caps: Caps }): Scheduled => {
  const lenses = [...new Set(brief.slots.map((state) => state.slot.lens))];
  const asked = askedByLens(brief);
  const room = (lens: string): number => Math.min(caps.round, caps.lens - (asked.get(lens) ?? 0));
  const worth = brief.slots
    .map((state, order) => ({ state, order, lens: lenses.indexOf(state.slot.lens), score: score(state) }))
    .filter((each) => !done && each.score >= FLOOR && room(each.state.slot.lens) > 0)
    .toSorted((a, b) => b.score - a.score || a.lens - b.lens || a.order - b.order);
  const top = worth[0];
  if (top === undefined) {
    return { kind: 'draft', open: openQuestions(brief) };
  }
  const lens = top.state.slot.lens;
  return {
    kind: 'ask',
    lens,
    slots: worth
      .filter((each) => each.state.slot.lens === lens)
      .slice(0, room(lens))
      .map((each) => each.state.slot.id),
  };
};
