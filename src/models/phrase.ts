import type { Engine } from 'fascicle';
import { z } from 'zod';

import type { Question, Read } from '../brief/index.js';
import { ask, json, type Reach } from './call.js';
import { viewOf, type SlotView } from './inputs.js';

// `phrase` runs on the frontier model: the core picked this round's slots, and it phrases one to
// four questions about them, starting from each slot's bank questions and adapting them to what
// the person has said (D1 (interpreted-answers)). Every question after intake's recommends an
// answer, and a menu offers two to four options (C8 (broad-then-narrow)); the front end adds
// "something else" itself.

const SYSTEM = `storyboard/phrase

You phrase the next round of a planning interview. You're given the slots this round asks about,
the question bank's questions for them, every slot the brief has with what it holds so far, and
the questions already asked.

Write one question for each of the round's slots, in the order given. Two slots can share one
question when a single question asks both naturally.

- Start from the bank's questions for the slot, and adapt the one that fits best to what the
  person has said: their project, their people, their words. Never ask for what the brief already
  holds, and never ask a question already asked.
- Keep that question's kind. An open question has no options. A menu has two to four options,
  each a whole answer, short and distinct. Never add "something else" or "other": the person can
  always answer in their own words.
- Every question recommends an answer. On a menu it's one of the options, written the same way.
  When the question is about the person's world, recommend the likeliest answer, for them to
  confirm. When it asks them to make a call, recommend the safest default: the one that commits
  the plan to the least.
- A question asks one thing, in one sentence, with nothing before it.

Reply with only the JSON object.`;

/** A question as the phrase step writes it: the round's slots it asks about, and how it asks. */
const question = (slots: readonly string[]) =>
  z.object({
    slots: z.array(z.enum(slots)).min(1).describe('The slots it asks about, from this round.'),
    kind: z.enum(['open', 'menu']).describe("The kind of the bank question it's adapted from."),
    text: z.string().regex(/\S/).describe('The question, in one sentence.'),
    options: z.array(z.string().regex(/\S/)).max(4).describe('Two to four for a menu, and none for an open question.'),
    recommended: z.string().regex(/\S/).describe('The answer it recommends: on a menu, one of its options, written the same way.'),
  });

/** Why a phrased question breaks the rules of its kind, or undefined when it keeps them. */
const kindProblem = ({ kind, options, recommended }: z.infer<ReturnType<typeof question>>): string | undefined => {
  if (kind === 'open') {
    return options.length === 0 ? undefined : `is open, and it has ${options.length} options`;
  }
  if (options.length < 2) {
    return `is a menu of ${options.length} options, and a menu has two to four`;
  }
  return options.includes(recommended) ? undefined : `recommends "${recommended}", which isn't one of its options`;
};

/** The schema for a round about the slots `slots`: one to four questions, none asking about a slot twice. */
const roundFor = (slots: readonly string[]) =>
  z
    .object({
      questions: z
        .array(question(slots))
        .min(1)
        .max(Math.min(4, Math.max(1, slots.length)))
        .describe("The round's questions, one for each slot or fewer."),
    })
    .superRefine(({ questions }, context) => {
      for (const [index, each] of questions.entries()) {
        const problem = kindProblem(each);
        if (problem !== undefined) {
          context.addIssue({ code: 'custom', path: ['questions', index], message: `the question ${problem}` });
        }
      }
      const asked = questions.flatMap((each) => each.slots);
      const twice = asked.find((id, index) => asked.indexOf(id) !== index);
      if (twice !== undefined) {
        context.addIssue({ code: 'custom', path: ['questions'], message: `two questions ask about "${twice}", and a round asks one question a slot` });
      }
    });

/** A question in a lens's bank, as `phrase` is given it. */
export type BankQuestion = {
  readonly id: string;
  readonly kind: 'intake' | 'open' | 'menu';
  readonly slots: readonly string[];
  readonly text: string;
  readonly options: readonly string[];
  readonly recommended: string | null;
};

/** What `phrase` is given: the round's slots, their bank questions, the brief, and what's been asked. */
export type Phrasing = {
  /** The slots to ask about, highest score first, as the scheduler picked them. */
  readonly round: readonly string[];
  /** Every slot the brief has, for what's known so far. */
  readonly slots: readonly SlotView[];
  /** The bank's questions about the round's slots. */
  readonly bank: readonly BankQuestion[];
  /** Every question asked so far, as it was phrased. */
  readonly asked: readonly string[];
};

/** A question as `phrase` writes it, which the wiring gives an id before it's asked. */
export type Phrased = Omit<Question, 'id' | 'recommended'> & { readonly recommended: string };

/** The user message: the round, its bank questions, the brief and what's been asked. */
const promptOf = ({ round, slots, bank, asked }: Phrasing): string =>
  [
    `This round asks about these slots, in this order: ${round.join(', ')}.`,
    "The bank's questions about them, as JSON:",
    json(bank.filter((each) => each.kind !== 'intake')),
    'Every slot the brief has, as JSON, with what it holds so far:',
    json(slots.map(viewOf)),
    'The questions already asked, as JSON:',
    json(asked),
  ].join('\n\n');

/** The `phrase` call, on the frontier model `model`. */
export const phraseOn =
  (engine: Engine, model: string) =>
  async (input: Phrasing): Promise<Read<readonly Phrased[]>> => {
    const reach: Reach = { provider: 'anthropic', model };
    const read = await ask({ engine, ...reach, id: 'phrase', system: SYSTEM, schema: roundFor(input.round) }, promptOf(input));
    return read.ok ? { ok: true, value: read.value.questions.map(({ slots, text, options, recommended }) => ({ slots, text, options, recommended })) } : read;
  };
