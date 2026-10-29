import type { Read } from '../brief/index.js';
import { words, wrap } from './wrap.js';

// The keyframes emitter. The drafting model writes the Intent as prose and every other item as
// data, and this writes `keyframes.md` from them in keyframes' usual form, so `keyframes check`
// finds what's in the content and never what's in the syntax (D2 (draft-as-data)). It writes only
// the sections this goal drafts: no Map, no Scenarios and no file pointers (D5 (intent-sections)).

/** The itemized sections, in the file's order: each one's heading, the letter of its IDs, and what an item in it is called. */
const SECTIONS = [
  { section: 'principles', heading: 'Principles', letter: 'P', noun: 'principle' },
  { section: 'constraints', heading: 'Constraints', letter: 'C', noun: 'constraint' },
  { section: 'decisions', heading: 'Decisions', letter: 'D', noun: 'decision' },
  { section: 'taste', heading: 'Taste', letter: 'T', noun: 'taste' },
  { section: 'questions', heading: 'Questions', letter: 'Q', noun: 'question' },
  { section: 'ideas', heading: 'Ideas', letter: 'I', noun: 'idea' },
] as const;

type Section = (typeof SECTIONS)[number]['section'];

/** An item the drafting model wrote, as data. */
type Item = {
  readonly section: Section;
  /** A short name for it, which the emitter makes a slug that no other item in the plan has. */
  readonly slug: string;
  readonly text: string;
  /** Why, written as its `because:` line: every Decision needs one, and any other item may have one. */
  readonly because: string | null;
};

/** A slot still open at the draft, phrased as a question (D18 (open-becomes-question)). */
type Open = {
  readonly slug: string;
  readonly text: string;
  /** The slot's latest recommended default, or null when no question about it recommended one. */
  readonly lean: string | null;
};

/** A draft: the project's name, its Intent as prose, the items drafted, and every slot left open. */
export type Draft = {
  readonly name: string;
  readonly intent: string;
  readonly items: readonly Item[];
  readonly open: readonly Open[];
};

/** Whether text is missing, or holds nothing but spaces. */
const blank = (text: string | null): boolean => text === null || text.trim() === '';

/** Why a draft can't be written, or undefined when it can. */
const problemWith = (draft: Draft): string | undefined => {
  if (blank(draft.name)) {
    return 'the draft has no name';
  }
  if (blank(draft.intent)) {
    return 'the draft has no Intent';
  }
  const empty = draft.items.find((item) => blank(item.text));
  if (empty !== undefined) {
    return `the ${empty.section} item "${empty.slug}" has no text`;
  }
  const unsaid = draft.items.find((item) => item.section === 'decisions' && blank(item.because));
  if (unsaid !== undefined) {
    return `the decision "${unsaid.slug}" doesn't say why`;
  }
  const open = draft.open.find((each) => blank(each.text));
  return open === undefined ? undefined : `the open question "${open.slug}" has no text`;
};

/** A name as a slug: lowercase letters and digits, accents dropped, joined by hyphens. */
const slugOf = (name: string): string =>
  name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

/** `slug`, or the first of `slug-2`, `slug-3` and on that `taken` doesn't hold. */
const unique = (slug: string, taken: ReadonlySet<string>): string => {
  let candidate = slug;
  for (let count = 2; taken.has(candidate); count += 1) {
    candidate = `${slug}-${count}`;
  }
  return candidate;
};

/** An open slot as a Question whose own text ends with what it leans to, since keyframes has no `lean` key. */
const asQuestion = ({ slug, text, lean }: Open): Item => ({
  section: 'questions',
  slug,
  text: lean === null || blank(lean) ? text : `${text.trim()} Lean: ${lean.trim()}`,
  because: null,
});

/** The Intent's paragraphs, each wrapped, with a heading's marker escaped so it stays prose. */
const intentLines = (intent: string): readonly string[] =>
  intent
    .split(/\n\s*\n/)
    .filter((paragraph) => !blank(paragraph))
    .flatMap((paragraph, index) => [...(index === 0 ? [] : ['']), ...wrap('', paragraph.trim().replace(/^#/, '\\#'), '')]);

/** An item's lines: its ID, slug and text, wrapped, then its `because:` line if it has one. */
const itemLines = (id: string, slug: string, { text, because }: Item): readonly string[] => [
  ...wrap(`- **${id} (${slug})**: `, text, '  '),
  ...(because === null || blank(because) ? [] : wrap('  - because: ', because, '    ')),
];

/**
 * Writes a draft as `keyframes.md`: its name, its Intent, then each section that has an item, in
 * keyframes' order. IDs count from 1 in each section, every slug is lowercase words joined by
 * hyphens and unique in the plan, and the open slots come last among the Questions. A draft with
 * no name or Intent, an item with no text, or a Decision that doesn't say why is refused.
 */
export const emitKeyframes = (draft: Draft): Read<string> => {
  const problem = problemWith(draft);
  if (problem !== undefined) {
    return { ok: false, problem };
  }
  const taken = new Set<string>();
  const sections = SECTIONS.flatMap(({ section, heading, letter, noun }) => {
    const items = [...draft.items.filter((item) => item.section === section), ...(section === 'questions' ? draft.open.map(asQuestion) : [])];
    if (items.length === 0) {
      return [];
    }
    const lines = items.flatMap((item, index) => {
      const slug = unique(slugOf(item.slug) || noun, taken);
      taken.add(slug);
      return itemLines(`${letter}${index + 1}`, slug, item);
    });
    return ['', `## ${heading}`, '', ...lines];
  });
  const lines = [`# ${words(draft.name).join(' ')}`, '', '## Intent', '', ...intentLines(draft.intent), ...sections];
  return { ok: true, value: `${lines.join('\n')}\n` };
};
