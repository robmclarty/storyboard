import { attempt, refuse, type Read } from './read.js';

// The answers log, `answers.jsonl`: one JSON line for each event of the core, appended and never
// rewritten, each stamped with the `storyboard turn` call that wrote it (D11 (log-is-truth)).
// Every model output the brief depends on is in it, the slot updates read from each answer and the
// questions as they were phrased, so it replays without a model. A call can append several lines,
// so each answer and its reading are on disk before the next model call can fail, and the call
// number groups them back into one exchange per call.

const STATUSES = ['clear', 'partial', 'missing'] as const;

/** How much the brief knows about a slot. */
export type Status = (typeof STATUSES)[number];

const WORKS = ['product', 'feature', 'library', 'game', 'content', 'event'] as const;

/** The kinds of work intake tells apart. */
export type Work = (typeof WORKS)[number];

const SIZES = ['tiny', 'small', 'medium', 'large'] as const;

/** How big the work is (D20 (four-sizes)). */
export type Size = (typeof SIZES)[number];

/** A question put to the person, as it was phrased. */
export type Question = {
  /** Unique in the session: the answer comes back keyed by it. */
  readonly id: string;
  /** The slots it asks about, all in one lens. */
  readonly slots: readonly string[];
  readonly text: string;
  /** None for an open question, or two to four for a menu (C8 (broad-then-narrow)). */
  readonly options: readonly string[];
  /** The answer it recommends, or null when it has none, as intake's open questions don't. */
  readonly recommended: string | null;
};

/** The person's answer to one question, word for word. */
type Answer = { readonly question: string; readonly text: string };

/** What the model read about one slot: its status and its whole value (D16 (model-sets-status)). */
export type Update = {
  readonly slot: string;
  readonly status: Status;
  /** Short statements, and none exactly when the slot is Missing. */
  readonly value: readonly string[];
};

/** What every entry is stamped with, both passed in as values (C3 (pure-core)). */
export type Stamp = {
  /** The number of the `storyboard turn` call that wrote it, counting from 1. */
  readonly call: number;
  /** The clock's time. */
  readonly at: string;
};

/** One line of the log. */
export type Entry = Stamp &
  (
    | { readonly kind: 'asked'; readonly questions: readonly Question[] }
    | { readonly kind: 'answered'; readonly answers: readonly Answer[]; readonly updates: readonly Update[] }
    | { readonly kind: 'classified'; readonly work: Work; readonly size: Size }
    | { readonly kind: 'done' }
    | { readonly kind: 'drafted'; readonly chunks: readonly string[] }
    | { readonly kind: 'passed'; readonly chunk: number }
    | {
        readonly kind: 'corrected';
        readonly chunk: number;
        /** The correction, word for word. */
        readonly text: string;
        /** The draft's items it names, such as `D3`. */
        readonly items: readonly string[];
        readonly updates: readonly Update[];
      }
    | { readonly kind: 'accepted' }
  );

const KINDS = [
  'asked',
  'answered',
  'classified',
  'done',
  'drafted',
  'passed',
  'corrected',
  'accepted',
] as const satisfies readonly Entry['kind'][];

/** An object's fields by name. */
type Fields = ReadonlyMap<string, unknown>;

/** The fields of an object, refusing anything that isn't one. */
const objectAt = (raw: unknown, where: string): Fields => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    refuse(`${where} isn't an object`);
  }
  return new Map<string, unknown>(Object.entries(raw));
};

/** The fields of an object that must have exactly `names`, refusing one missing or one extra. */
const fieldsAt = (raw: unknown, where: string, names: readonly string[]): Fields => {
  const fields = objectAt(raw, where);
  const missing = names.find((name) => !fields.has(name));
  if (missing !== undefined) {
    refuse(`${where} has no "${missing}"`);
  }
  const extra = [...fields.keys()].find((name) => !names.includes(name));
  if (extra !== undefined) {
    refuse(`${where} has a field it shouldn't: "${extra}"`);
  }
  return fields;
};

/** Where a field sits, for a message: the entry's own fields by name alone. */
const inside = (where: string, name: string): string => (where === 'the entry' ? `"${name}"` : `${where}.${name}`);

/** Text with something in it besides spaces, kept as written. */
const textAt = (raw: unknown, where: string): string => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    refuse(`${where} isn't text`);
  }
  return raw;
};

/** Text with no spaces in it, such as an id. */
const tokenAt = (raw: unknown, where: string): string => {
  const text = textAt(raw, where);
  if (/\s/.test(text)) {
    refuse(`${where} has a space in it`);
  }
  return text;
};

/** One of `values`, exactly as written. */
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (raw: unknown, where: string): T => {
    const found = values.find((value) => value === raw);
    if (found === undefined) {
      refuse(
        raw === undefined
          ? `${where} is missing`
          : `${where} is ${JSON.stringify(raw)}, which isn't one of ${values.join(', ')}`,
      );
    }
    return found;
  };

/** A whole number, `min` or more. */
const wholeFrom =
  (min: number) =>
  (raw: unknown, where: string): number => {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min) {
      refuse(`${where} isn't a whole number from ${min}`);
    }
    return raw;
  };

/** A count or an index, zero or more. */
const countAt = wholeFrom(0);

/** A list of `min` to `max` items, each read by `item`. */
const listAt = <T>(
  raw: unknown,
  where: string,
  item: (raw: unknown, where: string) => T,
  [min, max]: readonly [number, number],
): readonly T[] => {
  if (!Array.isArray(raw)) {
    refuse(`${where} isn't a list`);
  }
  if (raw.length < min || raw.length > max) {
    const range = max === Infinity ? `at least ${min}` : `${min} to ${max}`;
    refuse(`${where} has ${raw.length} items, and it holds ${range}`);
  }
  return raw.map((each, index) => item(each, `${where}[${index}]`));
};

/** Refuses a list that names the same thing twice. */
const distinct = (names: readonly string[], where: string): void => {
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice !== undefined) {
    refuse(`${where} names "${twice}" twice`);
  }
};

const ANY: readonly [number, number] = [0, Infinity];
const SOME: readonly [number, number] = [1, Infinity];

const questionAt = (raw: unknown, where: string): Question => {
  const fields = fieldsAt(raw, where, ['id', 'slots', 'text', 'options', 'recommended']);
  const slots = listAt(fields.get('slots'), inside(where, 'slots'), tokenAt, SOME);
  const options = listAt(fields.get('options'), inside(where, 'options'), textAt, [0, 4]);
  const recommended = fields.get('recommended');
  distinct(slots, inside(where, 'slots'));
  if (options.length === 1) {
    refuse(`${inside(where, 'options')} has one option, and a menu has two to four`);
  }
  return {
    id: tokenAt(fields.get('id'), inside(where, 'id')),
    slots,
    text: textAt(fields.get('text'), inside(where, 'text')),
    options,
    recommended: recommended === null ? null : textAt(recommended, inside(where, 'recommended')),
  };
};

const answerAt = (raw: unknown, where: string): Answer => {
  const fields = fieldsAt(raw, where, ['question', 'text']);
  return {
    question: tokenAt(fields.get('question'), inside(where, 'question')),
    text: textAt(fields.get('text'), inside(where, 'text')),
  };
};

const updateAt = (raw: unknown, where: string): Update => {
  const fields = fieldsAt(raw, where, ['slot', 'status', 'value']);
  const status = oneOf(STATUSES)(fields.get('status'), inside(where, 'status'));
  const value = listAt(fields.get('value'), inside(where, 'value'), textAt, ANY);
  if ((status === 'missing') !== (value.length === 0)) {
    refuse(`${inside(where, 'value')} must be empty exactly when the status is missing`);
  }
  return { slot: tokenAt(fields.get('slot'), inside(where, 'slot')), status, value };
};

/** A list of updates, each naming a different slot. */
const updatesAt = (raw: unknown): readonly Update[] => {
  const updates = listAt(raw, '"updates"', updateAt, ANY);
  distinct(
    updates.map((update) => update.slot),
    '"updates"',
  );
  return updates;
};

/** The fields of an entry of a known kind, and its stamp. */
const entryFields = (raw: unknown, names: readonly string[]): readonly [Fields, Stamp] => {
  const fields = fieldsAt(raw, 'the entry', ['kind', 'call', 'at', ...names]);
  return [fields, { call: wholeFrom(1)(fields.get('call'), '"call"'), at: textAt(fields.get('at'), '"at"') }];
};

/** How each kind of entry reads, building it with its fields in their usual order. */
const ENTRIES: { readonly [K in Entry['kind']]: (raw: unknown) => Extract<Entry, { kind: K }> } = {
  asked: (raw) => {
    const [fields, stamp] = entryFields(raw, ['questions']);
    const questions = listAt(fields.get('questions'), '"questions"', questionAt, [1, 4]);
    distinct(
      questions.map((question) => question.id),
      '"questions"',
    );
    return { kind: 'asked', ...stamp, questions };
  },
  answered: (raw) => {
    const [fields, stamp] = entryFields(raw, ['answers', 'updates']);
    const answers = listAt(fields.get('answers'), '"answers"', answerAt, SOME);
    distinct(
      answers.map((answer) => answer.question),
      '"answers"',
    );
    return { kind: 'answered', ...stamp, answers, updates: updatesAt(fields.get('updates')) };
  },
  classified: (raw) => {
    const [fields, stamp] = entryFields(raw, ['work', 'size']);
    const work = oneOf(WORKS)(fields.get('work'), '"work"');
    return { kind: 'classified', ...stamp, work, size: oneOf(SIZES)(fields.get('size'), '"size"') };
  },
  done: (raw) => ({ kind: 'done', ...entryFields(raw, [])[1] }),
  drafted: (raw) => {
    const [fields, stamp] = entryFields(raw, ['chunks']);
    return { kind: 'drafted', ...stamp, chunks: listAt(fields.get('chunks'), '"chunks"', textAt, SOME) };
  },
  passed: (raw) => {
    const [fields, stamp] = entryFields(raw, ['chunk']);
    return { kind: 'passed', ...stamp, chunk: countAt(fields.get('chunk'), '"chunk"') };
  },
  corrected: (raw) => {
    const [fields, stamp] = entryFields(raw, ['chunk', 'text', 'items', 'updates']);
    return {
      kind: 'corrected',
      ...stamp,
      chunk: countAt(fields.get('chunk'), '"chunk"'),
      text: textAt(fields.get('text'), '"text"'),
      items: listAt(fields.get('items'), '"items"', tokenAt, ANY),
      updates: updatesAt(fields.get('updates')),
    };
  },
  accepted: (raw) => ({ kind: 'accepted', ...entryFields(raw, [])[1] }),
};

/** Reads an entry of any kind. */
const entryAt = (raw: unknown): Entry => ENTRIES[oneOf(KINDS)(objectAt(raw, 'the entry').get('kind'), '"kind"')](raw);

/** Parses one line of JSON, refusing a blank line or one that isn't JSON. */
const parseLine = (line: string): unknown => {
  if (line.trim() === '') {
    refuse('the line is empty');
  }
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed;
  } catch {
    return refuse("the line isn't JSON");
  }
};

/**
 * The line an entry is written as, ending in a newline, with its fields in their usual order. An
 * entry the log couldn't read back is refused, so nothing malformed is ever written.
 */
export const writeEntry = (entry: Entry): Read<string> => attempt(() => `${JSON.stringify(entryAt(entry))}\n`);

/**
 * Reads the answers log into its entries, in order. A malformed line refuses the whole log with
 * its line number, since a log that's wrong in one place can't be trusted to replay anywhere.
 */
export const readLog = (text: string): Read<readonly Entry[]> => {
  const lines = text.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  const entries: Entry[] = [];
  for (const [index, line] of lines.entries()) {
    const read = attempt(() => entryAt(parseLine(line)));
    if (!read.ok) {
      return { ok: false, line: index + 1, problem: read.problem };
    }
    entries.push(read.value);
  }
  return { ok: true, value: entries };
};
