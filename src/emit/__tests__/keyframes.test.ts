import { describe, expect, test } from 'vitest';

import { emitKeyframes, type Draft } from '../index.js';

type Item = Draft['items'][number];

/** The text a draft emits; a draft that's refused fails the test. */
const emit = (draft: Draft): string => {
  const read = emitKeyframes(draft);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** What emitting a draft refuses, or undefined if it writes. */
const refused = (draft: Draft): string | undefined => {
  const read = emitKeyframes(draft);
  return read.ok ? undefined : read.problem;
};

const item = (section: Item['section'], slug: string, text: string, because: string | null = null): Item => ({ section, slug, text, because });

/** A small draft with an item in every section and two open slots. */
const DRAFT: Draft = {
  name: 'inkwell',
  intent: "Inkwell keeps one person's notes in step between a phone and a laptop.\n\nIt isn't a team wiki.",
  items: [
    item('ideas', 'sharing', 'A read-only link to one note.'),
    item('principles', 'local-first', 'The device holds the truth; the server only relays.'),
    item('decisions', 'sqlite', 'Each device keeps its notes in one SQLite file.', 'one file is easy to back up.'),
    item('constraints', 'one-writer', 'Only the sync worker writes to the database.', 'two writers made the replay disagree.'),
    item('taste', 'quiet', 'It never interrupts the writing with a dialog.'),
    item('decisions', 'no-server-db', 'The server keeps nothing but the relay queue.', 'it only relays.'),
    item('questions', 'merging', 'How should two edits to the same line merge?'),
  ],
  open: [
    { slug: 'appetite', text: 'How much time is it worth?', lean: 'A month of evenings.' },
    { slug: 'audience', text: "Who else is it for?", lean: null },
  ],
};

describe('emitKeyframes writes a draft in keyframes\' usual form', () => {
  test('its name, its Intent, then each section with items in the file\'s order, IDs counting from 1 in each', () => {
    expect(emit(DRAFT)).toBe(
      [
        '# inkwell',
        '',
        '## Intent',
        '',
        "Inkwell keeps one person's notes in step between a phone and a laptop.",
        '',
        "It isn't a team wiki.",
        '',
        '## Principles',
        '',
        '- **P1 (local-first)**: The device holds the truth; the server only relays.',
        '',
        '## Constraints',
        '',
        '- **C1 (one-writer)**: Only the sync worker writes to the database.',
        '  - because: two writers made the replay disagree.',
        '',
        '## Decisions',
        '',
        '- **D1 (sqlite)**: Each device keeps its notes in one SQLite file.',
        '  - because: one file is easy to back up.',
        '- **D2 (no-server-db)**: The server keeps nothing but the relay queue.',
        '  - because: it only relays.',
        '',
        '## Taste',
        '',
        '- **T1 (quiet)**: It never interrupts the writing with a dialog.',
        '',
        '## Questions',
        '',
        '- **Q1 (merging)**: How should two edits to the same line merge?',
        '- **Q2 (appetite)**: How much time is it worth? Lean: A month of evenings.',
        "- **Q3 (audience)**: Who else is it for?",
        '',
        '## Ideas',
        '',
        '- **I1 (sharing)**: A read-only link to one note.',
        '',
      ].join('\n'),
    );
  });

  test('the same draft always writes the same bytes', () => {
    expect(emit(structuredClone(DRAFT))).toBe(emit(DRAFT));
  });

  test('a section with no items is left out, and there is never a Map, Scenarios or a pointer', () => {
    const text = emit({ ...DRAFT, items: [item('decisions', 'sqlite', 'One file.', 'easy.')], open: [] });
    expect(text.split('\n').filter((line) => line.startsWith('## '))).toEqual(['## Intent', '## Decisions']);
    expect(emit(DRAFT)).not.toMatch(/## (?:Map|Scenarios)|held-by:|paths:/);
  });

  test('every slug is lowercase words joined by hyphens, accents dropped', () => {
    const text = emit({
      ...DRAFT,
      items: [item('principles', 'Ask, Never Guess!', 'Ask.'), item('taste', '  café crème ', 'Warm.'), item('ideas', 'v2 -- sync', 'Later.')],
      open: [],
    });
    expect(text).toContain('- **P1 (ask-never-guess)**: Ask.');
    expect(text).toContain('- **T1 (cafe-creme)**: Warm.');
    expect(text).toContain('- **I1 (v2-sync)**: Later.');
  });

  test('no two items share a slug, across sections, and a slug with nothing left is named for its section', () => {
    const text = emit({
      ...DRAFT,
      items: [item('principles', 'sqlite', 'A.'), item('decisions', 'SQLite', 'B.', 'b.'), item('decisions', 'sqlite', 'C.', 'c.'), item('ideas', '!!!', 'D.')],
      open: [{ slug: 'sqlite', text: 'E?', lean: null }],
    });
    expect([...text.matchAll(/\*\*([A-Z]\d+) \(([^)]+)\)\*\*/g)].map((match) => `${match[1]} ${match[2]}`)).toEqual([
      'P1 sqlite',
      'D1 sqlite-2',
      'D2 sqlite-3',
      'Q1 sqlite-4',
      'I1 idea',
    ]);
  });

  test('every Decision has a because, and a Decision without one is refused', () => {
    expect(emit(DRAFT).match(/^- \*\*D\d+ .*\n {2}- because: .+$/gm)).toHaveLength(2);
    expect(refused({ ...DRAFT, items: [item('decisions', 'sqlite', 'One file.')] })).toBe('the decision "sqlite" doesn\'t say why');
    expect(refused({ ...DRAFT, items: [item('decisions', 'sqlite', 'One file.', '  ')] })).toBe('the decision "sqlite" doesn\'t say why');
  });

  test('an open slot is a Question whose own text ends "Lean:" and its default, never a sub-line', () => {
    const text = emit({ ...DRAFT, items: [], open: [{ slug: 'appetite', text: ' How much\ntime? ', lean: ' A month. ' }] });
    expect(text.endsWith('## Questions\n\n- **Q1 (appetite)**: How much time? Lean: A month.\n')).toBe(true);
    expect(text).not.toMatch(/^\s+- lean:/m);
  });

  test('an open slot with no default asks without leaning', () => {
    expect(emit({ ...DRAFT, items: [], open: [{ slug: 'audience', text: 'Who is it for?', lean: null }] })).toContain(
      '- **Q1 (audience)**: Who is it for?\n',
    );
  });

  test('long text wraps at 100 columns, an item\'s lines indented under it and its because\'s under that', () => {
    const long = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
    const lines = emit({ ...DRAFT, intent: long, items: [item('decisions', 'long', long, long)], open: [] }).split('\n');
    expect(lines.every((line) => line.length <= 100)).toBe(true);
    const decision = lines.slice(lines.indexOf('## Decisions') + 2, -1);
    expect(decision.map((line) => line.match(/^ */)?.[0].length)).toEqual([0, 2, 2, 2, 4, 4]);
    expect(decision.join(' ').replaceAll(/\s+/g, ' ')).toBe(`- **D1 (long)**: ${long} - because: ${long}`);
  });

  test('the Intent keeps its paragraphs, and stays prose even when it opens like a heading', () => {
    const text = emit({ ...DRAFT, intent: '\n\n# Not a heading.\n\n\n\nA second   paragraph\nover two lines.\n\n' });
    expect(text).toContain('## Intent\n\n\\# Not a heading.\n\nA second paragraph over two lines.\n\n## Principles');
  });

  test.each<readonly [string, Partial<Draft>, string]>([
    ['no name', { name: ' ' }, 'the draft has no name'],
    ['no Intent', { intent: '\n\n' }, 'the draft has no Intent'],
    ['an item with no text', { items: [item('taste', 'quiet', '')] }, 'the taste item "quiet" has no text'],
    ['an open slot with no text', { open: [{ slug: 'appetite', text: ' ', lean: 'A month.' }] }, 'the open question "appetite" has no text'],
  ])('a draft with %s is refused', (_name, change, problem) => {
    expect(refused({ ...DRAFT, ...change })).toBe(problem);
  });
});
