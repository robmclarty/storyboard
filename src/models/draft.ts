import type { Engine } from 'fascicle';
import { z } from 'zod';

import type { Draft } from '../emit/index.js';
import type { Read } from '../brief/index.js';
import { ask, json, type Reach } from './call.js';
import { viewOf, type SlotView, type Size, type Work } from './inputs.js';

// `draft` runs on the frontier model: it writes the plan's Intent as prose and every other item as
// data, and the core's emitter writes the file (D2 (draft-as-data)). Each open slot comes back as
// one question, and the wiring puts its lean beside it from the brief, so the lean is what a
// question recommended and never the model's guess (C5 (open-not-guessed), D18
// (open-becomes-question)). A redraft gets the draft before it, the corrections made on it word for
// word, and what `keyframes check` found (D4 (clean-to-accept), D19 (corrections-as-entries)).

/** An item the model drafts, as the emitter takes it. */
type Item = Draft['items'][number];

const SECTIONS = ['principles', 'constraints', 'decisions', 'taste', 'questions', 'ideas'] as const satisfies readonly Item['section'][];

const SYSTEM = `storyboard/draft

You draft a plan, keyframes.md, from the brief a planning interview built. Each of the brief's
slots lands in one section of the plan. You write the Intent as prose and every other item as
data, and storyboard writes the file.

- The Intent comes from the slots that land in the Intent: what the work is and who it's for, the
  problem as it stands today, what done looks like, and the appetite.
- Each other slot's statements become items in the section it lands in. A no-go is a constraint.
- Draft only from what the brief holds. Every item says what the person said or confirmed, in
  their words where they had good ones. Never add an item the brief doesn't hold.
- An open slot, one that isn't clear, gets exactly one question in "open", asking what the slot
  still needs. Its statements that already make a whole item may be drafted as items, but never
  as a decision without its why. storyboard adds each open question's lean, so don't write one.
- Follow the rubric: what a good item holds, the budgets the plan stays inside, and the defaults
  to steer away from.
- On a redraft you're given the draft before it and the person's corrections, word for word.
  Apply every correction, and leave everything they didn't correct as it was. When you're given
  findings from keyframes check, fix each one.

Reply with only the JSON object.`;

/** Text with something in it besides spaces. */
const text = z.string().regex(/\S/);

/** A short name, which the emitter makes a slug. */
const slug = text.describe('A short name for it, a few lowercase words joined by hyphens, such as "no-telemetry".');

const item = z.object({
  section: z.enum(SECTIONS).describe('The section it goes in.'),
  slug,
  text: text.describe('The item, in a sentence or two and under 60 words.'),
  because: text.nullable().describe('Why: required on a decision, and on any other item only when the person said why. Null otherwise.'),
});

/** The schema for a draft whose open slots are `open`: each one asked about exactly once. */
const draftFor = (open: readonly string[]) =>
  z
    .object({
      intent: text.describe('The Intent, as prose with no heading: three short paragraphs at most, a blank line between them.'),
      items: z.array(item).describe('Every other item, in the order it should appear in its section.'),
      open: z
        .array(z.object({ slot: z.enum(open).describe("The open slot's id."), slug, text: text.describe('The question, in one sentence, with no lean.') }))
        .describe('One question for each open slot.'),
    })
    .superRefine((drafted, context) => {
      for (const [index, each] of drafted.items.entries()) {
        if (each.section === 'decisions' && each.because === null) {
          context.addIssue({ code: 'custom', path: ['items', index, 'because'], message: `the decision "${each.slug}" doesn't say why` });
        }
      }
      const asked = drafted.open.map((each) => each.slot);
      const unasked = open.find((id) => !asked.includes(id));
      const twice = asked.find((id, index) => asked.indexOf(id) !== index);
      if (unasked !== undefined || twice !== undefined) {
        const problem = unasked === undefined ? `the open slot "${twice ?? ''}" has two questions` : `the open slot "${unasked}" has no question`;
        context.addIssue({ code: 'custom', path: ['open'], message: `${problem}, and each open slot has one` });
      }
    });

/** One of `keyframes check`'s findings on the draft before, as `draft` is given it. */
type Finding = {
  readonly line: number;
  readonly severity: 'error' | 'warning' | 'note';
  readonly code: string;
  readonly message: string;
};

/** A correction made in playback, word for word, with the chunk it was made on. */
type Correction = {
  /** The chunk's text, as the person was shown it. */
  readonly chunk: string;
  readonly text: string;
  /** The draft's items it names, such as `D3`. */
  readonly items: readonly string[];
};

/** What `draft` is given: the brief, its open slots, the rubric, and for a redraft what came before. */
export type Drafting = {
  readonly work: Work | null;
  readonly size: Size | null;
  /** Every slot the brief has, with the section it lands in. */
  readonly slots: readonly (SlotView & { readonly lands: string })[];
  /** The slots still open, each to come back as one question. */
  readonly open: readonly string[];
  /** The lenses' rubrics, in the lenses' order. */
  readonly rubric: string;
  /** The draft before, as emitted, or null for a first draft. */
  readonly previous: string | null;
  readonly corrections: readonly Correction[];
  readonly findings: readonly Finding[];
};

/** A draft as the model writes it: the emitter's draft, but with each open slot's question and no lean or name. */
export type Drafted = {
  readonly intent: string;
  readonly items: readonly Item[];
  readonly open: readonly { readonly slot: string; readonly slug: string; readonly text: string }[];
};

/** The user message: the rubric, the work and its slots, the open slots, then what came before. */
const promptOf = ({ work, size, slots, open, rubric, previous, corrections, findings }: Drafting): string =>
  [
    'The rubric:',
    rubric.trim(),
    `The work: ${work ?? 'not classified'}, ${size ?? 'of no size yet'}.`,
    'The brief, as JSON: every slot, the section it lands in, its status and what it holds.',
    json(slots.map((slot) => ({ ...viewOf(slot), 'lands in': slot.lands }))),
    open.length === 0 ? 'No slot is open.' : `The open slots, each to get one question: ${open.join(', ')}.`,
    ...(previous === null ? [] : ['The draft before this one:', previous.trim()]),
    ...(corrections.length === 0 ? [] : ["The person's corrections to it, word for word, as JSON:", json(corrections)]),
    ...(findings.length === 0 ? [] : ['What keyframes check found in it, as JSON:', json(findings)]),
  ].join('\n\n');

/** The most tokens a draft may take: a plan inside keyframes' 2000 words, as JSON, with room to spare. */
const TOKENS = 16_000;

/** The `draft` call, on the frontier model `model`. */
export const draftOn =
  (engine: Engine, model: string) =>
  (input: Drafting): Promise<Read<Drafted>> => {
    const reach: Reach = { provider: 'anthropic', model };
    return ask({ engine, ...reach, id: 'draft', system: SYSTEM, schema: draftFor(input.open), max_tokens: TOKENS }, promptOf(input));
  };
