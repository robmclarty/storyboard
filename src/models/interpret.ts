import type { Engine } from 'fascicle';
import { z } from 'zod';

import type { Read } from '../brief/index.js';
import { ask, json, type Reach } from './call.js';
import { viewOf, type Said, type SlotView, type Update } from './inputs.js';

// `interpret` runs on the frontier model: it reads what the person said into updates to the
// brief's slots, each with its status, judged against the slot's "Clear when" line (D1
// (interpreted-answers), D16 (model-sets-status)). The core applies them as they come, so the
// schema holds every update to what the log will take: a slot the call was given, named once, and
// a value that's empty exactly when the slot is Missing.

const SYSTEM = `storyboard/interpret

You read what a person said in a planning interview into updates to the brief's slots. A slot is
one thing the plan needs to know. Each says what it holds and what makes it Clear, and each has
the value and status the brief gave it before this.

For every slot that what they said touches, give its status and its whole value now:

- The value is a list of short statements, each saying one thing, in the person's words where
  they had good ones. Keep the statements that still hold, change or drop the ones they corrected,
  and add what's new. A slot about what the work is usually holds one statement; a slot of
  principles or decisions may hold several.
- The status is clear when the value meets the slot's "clear when" line, partial when it says
  something but falls short of it, and missing, with an empty value, when nothing is known.
- An answer can touch slots its question didn't ask about. Update those too.
- Leave out every slot that nothing they said touches.

Write down only what the person said or confirmed. Never fill a gap with a likely guess: a slot
they left vague stays partial, and that's what lets a later question ask about it. Picking a
recommended answer confirms it. "Not sure" leaves a slot as it was, unless they said which way
they lean.

Reply with only the JSON object.`;

/** A statement in a slot's value: text with something in it besides spaces. */
const statement = z.string().regex(/\S/, 'a statement has words in it');

/** The schema for updates to the slots `ids`: each slot named once, its value empty exactly when it's Missing. */
const updatesFor = (ids: readonly string[]) => {
  const slot = z.enum(ids).describe("The slot's id.");
  const update = z.discriminatedUnion('status', [
    z.object({ slot, status: z.literal('missing'), value: z.array(statement).max(0).describe('Empty, since nothing is known.') }),
    z.object({
      slot,
      status: z.enum(['partial', 'clear']),
      value: z.array(statement).min(1).describe("The slot's whole value now: short statements, one thing each."),
    }),
  ]);
  return z
    .object({ updates: z.array(update).describe('One update for each slot that what the person said touches.') })
    .superRefine(({ updates }, context) => {
      const named = updates.map((each) => each.slot);
      const twice = named.find((id, index) => named.indexOf(id) !== index);
      if (twice !== undefined) {
        context.addIssue({ code: 'custom', path: ['updates'], message: `the slot "${twice}" is updated twice, and a slot is updated once` });
      }
    });
};

/** What `interpret` is given: the slots it may update, and what the person was asked and said. */
export type Interpreting = {
  readonly slots: readonly SlotView[];
  readonly said: readonly Said[];
};

/** The user message: the slots as the brief holds them, then what was asked and said. */
const promptOf = ({ slots, said }: Interpreting): string =>
  [
    'The slots, as JSON, each with the value and status the brief gave it before this:',
    json(slots.map(viewOf)),
    'What the person was asked, and what they said, word for word, as JSON:',
    json(said),
  ].join('\n\n');

/** The `interpret` call, on the frontier model `model`. */
export const interpretOn =
  (engine: Engine, model: string) =>
  async (input: Interpreting): Promise<Read<readonly Update[]>> => {
    const reach: Reach = { provider: 'anthropic', model };
    const schema = updatesFor(input.slots.map((slot) => slot.id));
    const read = await ask({ engine, ...reach, id: 'interpret', system: SYSTEM, schema }, promptOf(input));
    return read.ok ? { ok: true, value: read.value.updates } : read;
  };
