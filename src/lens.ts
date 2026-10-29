import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSlot, type Read, type Slot } from './brief/index.js';

// A lens is a folder of content, not code (lenses/README.md): `SKILL.md` lists its slots and what
// makes each one Clear, `questions.md` is its question bank, and `rubric.md` says what a good draft
// holds. This reads a lens into typed values, its slots through the core's own reader, and refuses
// anything that doesn't read with the file and the line it's on, so a typo in a lens fails a test
// instead of an interview (D12 (slots-in-lenses)).

/** The lenses that ship with storyboard, one level above both src/ and dist/. */
export const LENSES = fileURLToPath(new URL('../lenses/', import.meta.url));

const KINDS = ['intake', 'open', 'menu'] as const;

/** How a question asks: one of intake's open questions, an open follow-up, or a menu (C8 (broad-then-narrow)). */
type Kind = (typeof KINDS)[number];

/** A question in a lens's bank, which the phrase step adapts to what the person has said. */
export type BankQuestion = {
  /** Unique across the lenses. */
  readonly id: string;
  readonly kind: Kind;
  /** The slots it asks about, all in its own lens. */
  readonly slots: readonly string[];
  readonly text: string;
  /** Two to four for a menu, and none otherwise. */
  readonly options: readonly string[];
  /** The answer it recommends, which on a menu is one of its options, or null for intake's. */
  readonly recommended: string | null;
};

/** A lens: its slots, what makes each Clear, its question bank and its drafting rubric. */
export type Lens = {
  readonly name: string;
  readonly slots: readonly Slot[];
  /** What makes each slot Clear, by the slot's id: what `interpret` judges a slot's status against. */
  readonly clear: ReadonlyMap<string, string>;
  /** Broad to narrow, intake's first. */
  readonly questions: readonly BankQuestion[];
  readonly rubric: string;
};

/** A lens's three files, as text. */
type Files = { readonly skill: string; readonly questions: string; readonly rubric: string };

const FILES: Readonly<Record<keyof Files, string>> = { skill: 'SKILL.md', questions: 'questions.md', rubric: 'rubric.md' };

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** The most questions intake asks. */
const INTAKE = 3;

/** A line of a file, and its number, counting from 1. */
type Line = { readonly n: number; readonly text: string };

// Reading a file refuses from deep inside it, so readers throw a refusal and `attempt` turns it
// back into a Read that names the file. The cause marks it, so a bug's error still throws.
const REFUSED = Symbol('refused');

/** Refuses what's being read, saying why, at the line it's on when it's on one. */
const refuse: (line: number | undefined, problem: string) => never = (line, problem) => {
  throw Object.assign(new Error(problem, { cause: REFUSED }), { line });
};

/** Runs `read` on the file `where`, turning a refusal it throws into a Read. Any other error is a bug, and throws. */
const attempt = <T>(where: string, read: () => T): Read<T> => {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof Error && error.cause === REFUSED) {
      const line = 'line' in error && typeof error.line === 'number' ? { line: error.line } : {};
      return { ok: false, ...line, problem: `${where}: ${error.message}` };
    }
    throw error;
  }
};

/** A file's lines, numbered, leaving out any inside a fenced code block, which is an example and not content. */
const linesOf = (text: string): readonly Line[] => {
  let fenced = false;
  return text.split('\n').flatMap((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      return [];
    }
    return fenced ? [] : [{ n: index + 1, text: line }];
  });
};

/** The fields of the frontmatter `SKILL.md` opens with, and the lines after it. */
const frontmatter = (lines: readonly Line[]): { readonly fields: ReadonlyMap<string, string>; readonly body: readonly Line[] } => {
  if (lines[0]?.text !== '---') {
    refuse(1, "it doesn't open with frontmatter: a `---` line, the lens's name and description, and another `---`");
  }
  const end = lines.findIndex((line, index) => index > 0 && line.text === '---');
  if (end === -1) {
    refuse(1, 'its frontmatter never closes with a `---` line');
  }
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const [, key = '', value = ''] = /^([a-z]+):\s*(.*)$/.exec(line.text) ?? [];
    if (key === '') {
      refuse(line.n, "a line of the frontmatter isn't `key: value`");
    }
    fields.set(key, value.trim().replace(/^"(.*)"$/, '$1'));
  }
  return { fields, body: lines.slice(end + 1) };
};

/** A `##` section: the heading's line, and the lines under it. */
type Section = { readonly at: number; readonly lines: readonly Line[] };

/** The lines under each `##` heading, by the heading's text in lowercase. */
const sectionsOf = (lines: readonly Line[]): ReadonlyMap<string, Section> => {
  const found = new Map<string, { at: number; lines: Line[] }>();
  let current: Line[] | undefined;
  for (const line of lines) {
    const heading = /^## +(.+?)\s*$/.exec(line.text)?.[1];
    if (heading !== undefined) {
      current = [];
      found.set(heading.toLowerCase(), { at: line.n, lines: current });
    } else {
      current?.push(line);
    }
  }
  return found;
};

/** A section that must be there, by its heading. */
const sectionAt = (sections: ReadonlyMap<string, Section>, heading: string): Section => {
  const section = sections.get(heading.toLowerCase());
  if (section === undefined) {
    refuse(undefined, `it has no "## ${heading}" section`);
  }
  return section;
};

/** A sub-line under a bullet: `- key: value`, indented two spaces. */
type Sub = { readonly n: number; readonly key: string; readonly value: string };

/** A bullet at the left margin, `- **name**: text`, with its text carried on and its sub-lines. */
type Bullet = { readonly n: number; readonly name: string; readonly text: string; readonly subs: readonly Sub[] };

/** A bullet's text, or a sub-line's value, from its parts on each line. */
const joined = (parts: readonly string[]): string => parts.filter((part) => part !== '').join(' ');

/**
 * The bullets in `lines` written as `- **name**: text`. Indented lines below one carry its text on,
 * or the last sub-line's value once it has one, and the next line at the left margin ends it. A
 * bullet that opens with bold but doesn't read is refused, so a typo can't drop it; any other
 * bullet is prose.
 */
const bulletsOf = (lines: readonly Line[]): readonly Bullet[] => {
  const found: { n: number; name: string; text: string[]; subs: { n: number; key: string; value: string[] }[] }[] = [];
  let current: (typeof found)[number] | undefined;
  for (const { n, text } of lines) {
    if (text.trim() === '') {
      continue;
    }
    if (!/^\s/.test(text)) {
      current = undefined;
      if (text.startsWith('- **')) {
        const [, name = '', rest = ''] = /^- \*\*([^*]+)\*\*: *(.*)$/.exec(text) ?? [];
        if (name === '') {
          refuse(n, "a bullet that opens in bold isn't `- **name**: text`");
        }
        current = { n, name, text: [rest.trim()], subs: [] };
        found.push(current);
      }
      continue;
    }
    if (current === undefined) {
      continue;
    }
    const [, key = '', value = ''] = /^ {2}- ([a-z]+): *(.*)$/.exec(text) ?? [];
    if (key !== '') {
      current.subs.push({ n, key, value: [value.trim()] });
    } else if (/^\s+[-*] /.test(text)) {
      refuse(n, `a line under "${current.name}" isn't \`- key: value\`, indented two spaces`);
    } else {
      (current.subs.at(-1)?.value ?? current.text).push(text.trim());
    }
  }
  return found.map(({ n, name, text, subs }) => ({
    n,
    name,
    text: joined(text),
    subs: subs.map((sub) => ({ n: sub.n, key: sub.key, value: joined(sub.value) })),
  }));
};

/** The first name `names` holds twice, if one is. */
const twice = (names: readonly string[]): string | undefined => names.find((name, index) => names.indexOf(name) !== index);

const HEADER = ['slot', 'holds', 'impact', 'lands in'];

/** The cells of a table row, trimmed: `| a | b |` gives a and b. */
const cellsOf = (text: string): readonly string[] =>
  text
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** The slots in the table under `## Slots`, each read by the core's own reader (D12 (slots-in-lenses)). */
const slotsOf = (lens: string, section: Section): readonly Slot[] => {
  const [header, rule, ...rows] = section.lines.filter((line) => line.text.trimStart().startsWith('|'));
  if (header === undefined || cellsOf(header.text).join('|').toLowerCase() !== HEADER.join('|')) {
    refuse(header?.n ?? section.at, "the Slots table's header isn't | Slot | Holds | Impact | Lands in |");
  }
  if (rule === undefined || !cellsOf(rule.text).every((cell) => /^:?-+:?$/.test(cell))) {
    refuse(rule?.n ?? header.n, 'the Slots table has no `| --- |` line under its header');
  }
  if (rows.length === 0) {
    refuse(rule.n, 'the Slots table has no slots');
  }
  const slots = rows.map(({ n, text }) => {
    const cells = cellsOf(text);
    const [id = '', holds = '', impact = '', lands = ''] = cells;
    if (cells.length !== HEADER.length) {
      refuse(n, `a row of the Slots table has ${cells.length} cells, and it needs ${HEADER.length}`);
    }
    const read = readSlot(lens, { id, holds, impact, lands });
    if (!read.ok) {
      refuse(n, read.problem);
    }
    return read.value;
  });
  const repeated = twice(slots.map((slot) => slot.id));
  if (repeated !== undefined) {
    refuse(undefined, `the Slots table has the slot "${repeated}" twice`);
  }
  return slots;
};

/** What makes each slot Clear, from the bullets under `## When a slot is Clear`: one for every slot, and no others. */
const clearOf = (slots: readonly Slot[], section: Section): ReadonlyMap<string, string> => {
  const clear = new Map<string, string>();
  for (const { n, name, text, subs } of bulletsOf(section.lines)) {
    if (!slots.some((slot) => slot.id === name)) {
      refuse(n, `it says when "${name}" is Clear, and the lens has no slot "${name}"`);
    }
    if (clear.has(name)) {
      refuse(n, `it says when "${name}" is Clear twice`);
    }
    if (text === '' || subs.length > 0) {
      refuse(n, `when "${name}" is Clear is one line of text, with no sub-lines`);
    }
    clear.set(name, text);
  }
  const unsaid = slots.find((slot) => !clear.has(slot.id));
  if (unsaid !== undefined) {
    refuse(section.at, `it doesn't say when "${unsaid.id}" is Clear`);
  }
  return clear;
};

/** Reads `SKILL.md`: its frontmatter, which names the lens, its slots, and what makes each Clear. */
const readSkill = (lens: string, text: string): Pick<Lens, 'slots' | 'clear'> => {
  const { fields, body } = frontmatter(linesOf(text));
  if (fields.get('name') !== lens) {
    refuse(1, `its frontmatter names the lens "${fields.get('name') ?? ''}", and its folder is "${lens}"`);
  }
  if ((fields.get('description') ?? '') === '') {
    refuse(1, 'its frontmatter has no description');
  }
  const sections = sectionsOf(body);
  const slots = slotsOf(lens, sectionAt(sections, 'Slots'));
  return { slots, clear: clearOf(slots, sectionAt(sections, 'When a slot is Clear')) };
};

const KEYS: ReadonlySet<string> = new Set(['kind', 'slots', 'option', 'recommended']);

/** Reads one question of the bank, holding it to the rules of its kind. */
const questionOf = (lens: string, owned: readonly string[], { n, name: id, text, subs }: Bullet): BankQuestion => {
  if (!SLUG.test(id)) {
    refuse(n, `the question "${id}" isn't named as a slug: lowercase words joined by hyphens`);
  }
  if (text === '') {
    refuse(n, `the question "${id}" has no text`);
  }
  for (const [index, sub] of subs.entries()) {
    if (!KEYS.has(sub.key)) {
      refuse(sub.n, `the question "${id}" has a key it shouldn't: "${sub.key}"`);
    }
    if (sub.key !== 'option' && subs.findIndex((other) => other.key === sub.key) !== index) {
      refuse(sub.n, `the question "${id}" has "${sub.key}" twice`);
    }
  }
  const one = (key: string): Sub | undefined => subs.find((sub) => sub.key === key);
  const raw = one('kind');
  const kind = KINDS.find((each) => each === raw?.value);
  if (kind === undefined) {
    refuse(raw?.n ?? n, `the question "${id}" ${raw === undefined ? 'has no kind' : `is of the kind "${raw.value}"`}, and a kind is intake, open or menu`);
  }
  const named = one('slots');
  const slots = (named?.value ?? '')
    .split(',')
    .map((slot) => slot.trim())
    .filter((slot) => slot !== '');
  if (slots.length === 0) {
    refuse(named?.n ?? n, `the question "${id}" names no slots`);
  }
  const stray = slots.find((slot) => !owned.includes(slot));
  if (stray !== undefined) {
    refuse(named?.n ?? n, `the question "${id}" asks about the slot "${stray}", and the ${lens} lens has no slot "${stray}"`);
  }
  const repeated = twice(slots);
  if (repeated !== undefined) {
    refuse(named?.n ?? n, `the question "${id}" names the slot "${repeated}" twice`);
  }
  const options = subs.filter((sub) => sub.key === 'option').map((sub) => sub.value);
  const recommended = one('recommended')?.value ?? null;
  const problem = kindProblem(kind, options, recommended);
  if (problem !== undefined) {
    refuse(n, `the question "${id}" ${problem}`);
  }
  return { id, kind, slots, text, options, recommended };
};

/** Why a question breaks the rules of its kind, or undefined when it keeps them. */
const kindProblem = (kind: Kind, options: readonly string[], recommended: string | null): string | undefined => {
  if (kind === 'intake') {
    if (options.length > 0) {
      return 'is one of intake\'s, which are open, and it has options';
    }
    return recommended === null ? undefined : "is one of intake's, which recommend nothing, and it recommends an answer";
  }
  if (recommended === null || recommended === '') {
    return 'recommends no answer, and every question after intake\'s needs one';
  }
  if (kind === 'open') {
    return options.length === 0 ? undefined : `is open, and it has ${options.length} options`;
  }
  if (options.length < 2 || options.length > 4) {
    return `is a menu of ${options.length} options, and a menu has two to four`;
  }
  return options.includes(recommended) ? undefined : `recommends "${recommended}", which isn't one of its options`;
};

/**
 * Reads `questions.md`: every question, in order. Intake's come first, three at most, and every slot
 * has a question after them, since the scheduler may pick any slot to ask about.
 */
const readQuestions = (lens: string, slots: readonly Slot[], text: string): readonly BankQuestion[] => {
  const owned = slots.map((slot) => slot.id);
  const bullets = bulletsOf(linesOf(text));
  const questions = bullets.map((bullet) => questionOf(lens, owned, bullet));
  for (const [index, question] of questions.entries()) {
    const at = bullets[index]?.n;
    if (questions.findIndex((other) => other.id === question.id) !== index) {
      refuse(at, `the question "${question.id}" is in the bank twice`);
    }
    if (question.kind === 'intake' && questions.slice(0, index).some((before) => before.kind !== 'intake')) {
      refuse(at, `intake's questions come first, and "${question.id}" comes after a follow-up`);
    }
  }
  const intake = questions.filter((question) => question.kind === 'intake').length;
  if (intake > INTAKE) {
    refuse(undefined, `intake asks ${INTAKE} questions at most, and the bank has ${intake}`);
  }
  const unasked = owned.find((slot) => !questions.some((question) => question.kind !== 'intake' && question.slots.includes(slot)));
  if (unasked !== undefined) {
    refuse(undefined, `no question after intake's asks about the slot "${unasked}"`);
  }
  return questions;
};

/** Reads a lens from its three files, refusing the first thing that doesn't read, with its file and line. */
export const readLens = (name: string, files: Files): Read<Lens> => {
  const skill = attempt(`${name}/${FILES.skill}`, () => readSkill(name, files.skill));
  if (!skill.ok) {
    return skill;
  }
  const { slots, clear } = skill.value;
  const questions = attempt(`${name}/${FILES.questions}`, () => readQuestions(name, slots, files.questions));
  if (!questions.ok) {
    return questions;
  }
  const rubric = files.rubric.trim();
  if (rubric === '') {
    return { ok: false, problem: `${name}/${FILES.rubric}: it's empty` };
  }
  return { ok: true, value: { name, slots, clear, questions: questions.value, rubric } };
};

/** The code a failed file call gives, such as `ENOENT`. */
const codeOf = (error: unknown): unknown => (error instanceof Error && 'code' in error ? error.code : undefined);

/** A file of a lens, as text, or a refusal that names it when it isn't there. */
const textOf = async (root: string, name: string, file: string): Promise<Read<string>> => {
  try {
    return { ok: true, value: await readFile(join(root, name, file), 'utf8') };
  } catch (error) {
    if (codeOf(error) === 'ENOENT') {
      return { ok: false, problem: `${name}/${file} isn't there` };
    }
    throw error;
  }
};

/** Reads the lens `name` from its folder in `root`. */
const loadLens = async (root: string, name: string): Promise<Read<Lens>> => {
  const [skill, questions, rubric] = await Promise.all([
    textOf(root, name, FILES.skill),
    textOf(root, name, FILES.questions),
    textOf(root, name, FILES.rubric),
  ]);
  if (!skill.ok) {
    return skill;
  }
  if (!questions.ok) {
    return questions;
  }
  if (!rubric.ok) {
    return rubric;
  }
  return readLens(name, { skill: skill.value, questions: questions.value, rubric: rubric.value });
};

/** The first id two lenses share, as a problem, where `idsOf` gives a lens's ids of the kind `what`. */
const sharedProblem = (lenses: readonly Lens[], what: string, idsOf: (lens: Lens) => readonly string[]): string | undefined => {
  const owner = new Map<string, string>();
  for (const lens of lenses) {
    for (const id of idsOf(lens)) {
      const first = owner.get(id);
      if (first !== undefined) {
        return `the ${what} "${id}" is in both the ${first} and ${lens.name} lenses`;
      }
      owner.set(id, lens.name);
    }
  }
  return undefined;
};

/** Why lenses that each read can't be used together, or undefined when they can. */
const togetherProblem = (lenses: readonly Lens[]): string | undefined => {
  const late = lenses.slice(1).find((lens) => lens.questions.some((question) => question.kind === 'intake'));
  return (
    sharedProblem(lenses, 'slot', (lens) => lens.slots.map((slot) => slot.id)) ??
    sharedProblem(lenses, 'question', (lens) => lens.questions.map((question) => question.id)) ??
    (late === undefined ? undefined : `intake's questions are the first lens's, and the ${late.name} lens has some`)
  );
};

/**
 * Loads the lenses `names` from the folder `root`, in the order given, which is the order the
 * scheduler breaks ties in. A slot or a question in two lenses is refused, since an answer names a
 * slot by its id alone, and so is an intake question in any lens but the first.
 */
export const loadLenses = async (root: string, names: readonly string[]): Promise<Read<readonly Lens[]>> => {
  const lenses: Lens[] = [];
  for (const lens of await Promise.all(names.map((name) => loadLens(root, name)))) {
    if (!lens.ok) {
      return lens;
    }
    lenses.push(lens.value);
  }
  const problem = togetherProblem(lenses);
  return problem === undefined ? { ok: true, value: lenses } : { ok: false, problem };
};
