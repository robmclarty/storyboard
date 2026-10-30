import type { Read } from '../../src/brief/index.js';
import type { Classified, Drafted, Drafting, Interpreting, Models, Phrased, Phrasing, Said } from '../../src/models/index.js';

// A fake models edge for the wiring's and the CLI's tests, which never reach a model (C1
// (offline-gate), D9 (models-injected)). Each call answers from its script first, in order, and
// once the script runs out it answers the plain way: classify says a medium product, interpret
// reads each answer as the whole value of the slots its question asked about, Clear, phrase asks
// each slot the bank's first question about it, and draft writes every statement as an item in
// the section its slot lands in. A scripted `{ fail }` is a refusal, as a reply that fails its
// schema would be.

/** An update, as `interpret` gives one. */
type Update = Extract<Awaited<ReturnType<Models['interpret']>>, { ok: true }>['value'][number];

/** A scripted reply: the value to give, or a refusal. */
type Reply<T> = T | { readonly fail: string };

/** What each call answers with first, in order, before it answers the plain way. */
export type Script = {
  readonly classify?: readonly Reply<Classified>[];
  readonly interpret?: readonly Reply<readonly Update[]>[];
  readonly phrase?: readonly Reply<readonly Phrased[]>[];
  readonly draft?: readonly Reply<Drafted>[];
};

/** The fake, and what each call was given, in order. */
export type FakeModels = Models & {
  readonly calls: {
    readonly classify: (readonly Said[])[];
    readonly interpret: Interpreting[];
    readonly phrase: Phrasing[];
    readonly draft: Drafting[];
  };
};

/** Whether a scripted reply is a refusal. */
const isFail = <T>(reply: Reply<T>): reply is { readonly fail: string } =>
  typeof reply === 'object' && reply !== null && 'fail' in reply && Object.keys(reply).length === 1;

/** The next reply from `script`, or the plain one once it has run out. */
const replier = <T>(script: readonly Reply<T>[] | undefined) => {
  let index = 0;
  return (plain: () => T): Read<T> => {
    const reply = script?.[index];
    index += 1;
    if (reply === undefined) {
      return { ok: true, value: plain() };
    }
    return isFail(reply) ? { ok: false, problem: reply.fail } : { ok: true, value: reply };
  };
};

/** Each answer as the whole value of the slots its question asked about, Clear. */
const echo = ({ said }: Interpreting): readonly Update[] => {
  const values = new Map<string, string[]>();
  for (const { about, answer } of said) {
    for (const slot of about) {
      values.set(slot, [...(values.get(slot) ?? []), answer]);
    }
  }
  return [...values].map(([slot, value]) => ({ slot, status: 'clear', value }));
};

/** One question a slot, the bank's first about it, or a plain open one when the bank has none. */
const firstFromBank = ({ round, bank }: Phrasing): readonly Phrased[] =>
  round.map((slot) => {
    const found = bank.find((question) => question.kind !== 'intake' && question.slots.includes(slot));
    return found === undefined
      ? { slots: [slot], text: `What about ${slot}?`, options: [], recommended: 'Nothing yet.' }
      : { slots: [slot], text: found.text, options: found.options, recommended: found.recommended ?? 'Nothing yet.' };
  });

const SECTIONS = ['principles', 'constraints', 'decisions', 'taste', 'questions', 'ideas'] as const;

/** The itemized section a slot lands in, or undefined for the Intent. */
const sectionOf = (lands: string): Drafted['items'][number]['section'] | undefined => SECTIONS.find((section) => section === lands);

/** Every Clear slot's statements as items in its section, the Intent from the Intent's slots, and a question for each open slot. */
const itemize = ({ slots, open }: Drafting): Drafted => {
  const intent = slots.filter((slot) => slot.lands === 'intent').flatMap((slot) => slot.value);
  return {
    intent: intent.length === 0 ? 'Nothing is known of it yet.' : intent.join(' '),
    items: slots.flatMap((slot) => {
      const section = sectionOf(slot.lands);
      if (section === undefined || slot.status !== 'clear') {
        return [];
      }
      return slot.value.map((text, index) => ({
        section,
        slug: `${slot.id}-${index + 1}`,
        text,
        because: section === 'decisions' ? 'The person said so.' : null,
      }));
    }),
    open: open.map((slot) => ({ slot, slug: `open-${slot}`, text: `What's still open about ${slot}?` })),
  };
};

/** A fake models edge that answers from `script` first, then the plain way. */
export const fakeModels = (script: Script = {}): FakeModels => {
  const calls: FakeModels['calls'] = { classify: [], interpret: [], phrase: [], draft: [] };
  const replies = {
    classify: replier(script.classify),
    interpret: replier(script.interpret),
    phrase: replier(script.phrase),
    draft: replier(script.draft),
  };
  return {
    calls,
    classify: (said) => {
      calls.classify.push(said);
      return Promise.resolve(replies.classify(() => ({ work: 'product', size: 'medium' })));
    },
    interpret: (input) => {
      calls.interpret.push(input);
      return Promise.resolve(replies.interpret(() => echo(input)));
    },
    phrase: (input) => {
      calls.phrase.push(input);
      return Promise.resolve(replies.phrase(() => firstFromBank(input)));
    },
    draft: (input) => {
      calls.draft.push(input);
      return Promise.resolve(replies.draft(() => itemize(input)));
    },
    dispose: () => Promise.resolve(),
  };
};
