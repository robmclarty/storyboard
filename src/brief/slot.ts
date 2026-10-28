import type { Read } from './read.js';

/** The sections of `keyframes.md` a slot can land in, in the file's order (D5 (intent-sections)). */
const SECTIONS = ['intent', 'principles', 'constraints', 'decisions', 'taste', 'questions', 'ideas'] as const;

/** A section of `keyframes.md`, named as its heading is, in lowercase. */
type Section = (typeof SECTIONS)[number];

/** How much a slot matters to the draft, from 1 to 3 (D13 (fixed-weights)). */
type Impact = 1 | 2 | 3;

/** A slot as its lens defines it: one thing the brief holds, and the section it lands in. */
export type Slot = {
  /** Unique across every lens: an answer's updates name the slot by it. */
  readonly id: string;
  readonly lens: string;
  /** What it holds, as the lens's table says it. */
  readonly holds: string;
  readonly impact: Impact;
  readonly lands: Section;
};

/** A row of a lens's slot table, each cell as written there (D12 (slots-in-lenses)). */
export type SlotRow = {
  readonly id: string;
  readonly holds: string;
  readonly impact: string;
  readonly lands: string;
};

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const IMPACTS: ReadonlyMap<string, Impact> = new Map([
  ['1', 1],
  ['2', 2],
  ['3', 3],
]);

/** The sections as their headings write them, for a message. */
const HEADINGS = SECTIONS.map((section) => `${section.charAt(0).toUpperCase()}${section.slice(1)}`).join(', ');

/**
 * Reads a row of a lens's slot table into a typed slot, or says why it can't. Each cell is
 * trimmed, and the section may be written in any case, as its heading is.
 */
export const readSlot = (lens: string, row: SlotRow): Read<Slot> => {
  const id = row.id.trim();
  const holds = row.holds.trim();
  const impact = IMPACTS.get(row.impact.trim());
  const lands = SECTIONS.find((section) => section === row.lands.trim().toLowerCase());
  if (!SLUG.test(lens)) {
    return { ok: false, problem: `the lens "${lens}" isn't named as a slug: lowercase words joined by hyphens` };
  }
  if (!SLUG.test(id)) {
    return { ok: false, problem: `the slot "${id}" isn't named as a slug: lowercase words joined by hyphens` };
  }
  if (holds === '') {
    return { ok: false, problem: `the slot "${id}" doesn't say what it holds` };
  }
  if (impact === undefined) {
    return { ok: false, problem: `the slot "${id}" has impact "${row.impact.trim()}", and an impact is 1, 2 or 3` };
  }
  if (lands === undefined) {
    return { ok: false, problem: `the slot "${id}" lands in "${row.lands.trim()}", which isn't one of ${HEADINGS}` };
  }
  return { ok: true, value: { id, lens, holds, impact, lands } };
};
