import type { Engine } from 'fascicle';
import { z } from 'zod';

import type { Read } from '../brief/index.js';
import { ask, json, type Reach } from './call.js';
import type { Said, Size, Work } from './inputs.js';

// `classify` runs on the local model: it reads intake's answers into the work's kind, from the
// sketch's six, and its size (D20 (four-sizes)). Only tiny changes what happens next in this goal,
// and the lenses to come read both.

const WORKS = ['product', 'feature', 'library', 'game', 'content', 'event'] as const satisfies readonly Work[];

const SIZES = ['tiny', 'small', 'medium', 'large'] as const satisfies readonly Size[];

/** What makes work each kind. */
const KINDS: Readonly<Record<Work, string>> = {
  product: 'a whole thing people use on its own, such as an app, a site or a tool',
  feature: 'an addition or a change to something that already exists',
  library: 'code that other code calls, such as a package, a module or an API',
  game: 'something people play',
  content: 'writing, media or teaching, such as a book, a course, a video series or a set of docs',
  event: 'something that happens at a time and place, such as a launch, a workshop or a trip',
};

/** What makes work each size. */
const BIGNESS: Readonly<Record<Size, string>> = {
  tiny: 'a change too small to need a plan, such as a typo, a setting or a one-line fix',
  small: 'a day or two of work, in one part',
  medium: 'a few weeks of work, or several parts that fit together',
  large: 'months of work, or a team’s',
};

/** Each name and what it means, a line each, as the system prompt lists them. */
const listed = <T extends string>(names: readonly T[], meanings: Readonly<Record<T, string>>): string =>
  names.map((name) => `- ${name}: ${meanings[name]}.`).join('\n');

const SYSTEM = `storyboard/classify

You read a person's answers to the three questions that open a planning interview, and say what
kind of work it is and how big.

The kinds:

${listed(WORKS, KINDS)}

The sizes:

${listed(SIZES, BIGNESS)}

Judge by what the person said the work is now, not by what it could grow into. When it fits two
kinds, pick the one their own words lean to. When it fits two sizes, pick the larger, since a size
too small skips questions the plan needs.

Reply with only the JSON object.`;

/** The kind and size of the work. */
export const classified = z.object({
  work: z.enum(WORKS).describe('The kind of work.'),
  size: z.enum(SIZES).describe('How big the work is.'),
});

/** What `classify` reads from intake. */
export type Classified = z.infer<typeof classified>;

/** The user message: each of intake's questions, and the person's answer to it. */
const promptOf = (said: readonly Said[]): string =>
  `Intake's questions, and the person's answers, as JSON:\n\n${json(said.map(({ asked, answer }) => ({ asked, answer })))}`;

/** The `classify` call, on the local model `model`. */
export const classifyOn =
  (engine: Engine, model: string) =>
  (said: readonly Said[]): Promise<Read<Classified>> => {
    const reach: Reach = { provider: 'ollama', model };
    return ask({ engine, ...reach, id: 'classify', system: SYSTEM, schema: classified }, promptOf(said));
  };
