import type { Brief, Entry } from '../brief/index.js';

// What the calls are given, in shapes of their own: the edge imports only the core, so the wiring
// hands it plain values, and a lens's slot or a bank question fits these as it stands.

/** What the model read about one slot: its status and its whole value (D16 (model-sets-status)). */
export type Update = Extract<Entry, { kind: 'answered' }>['updates'][number];

/** A slot's status: clear, partial or missing. */
export type Status = Update['status'];

/** The kinds of work intake tells apart. */
export type Work = NonNullable<Brief['work']>;

/** How big the work is (D20 (four-sizes)). */
export type Size = NonNullable<Brief['size']>;

/** A slot as a call sees it: what it holds, what makes it Clear, and what the brief has of it. */
export type SlotView = {
  readonly id: string;
  readonly holds: string;
  /** What makes it Clear, as its lens's `SKILL.md` says. */
  readonly clear: string;
  readonly status: Status;
  readonly value: readonly string[];
};

/** One thing the person was asked, and what they said to it, word for word. */
export type Said = {
  /** A question's text, or the chunk of the draft they were shown. */
  readonly asked: string;
  /** The slots the question asked about, or none for a chunk of the draft. */
  readonly about: readonly string[];
  readonly answer: string;
};

/** A slot as a user message gives it, its fields named for the model. */
export const viewOf = ({ id, holds, clear, status, value }: SlotView): Readonly<Record<string, unknown>> => ({
  id,
  holds,
  'clear when': clear,
  status,
  value,
});
