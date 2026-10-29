import { describe, expect, test } from 'vitest';

import { cutPlayback, emitKeyframes, type Draft } from '../index.js';

const ENDING = "What's wrong or missing?";

/** The text a draft emits; a draft that's refused fails the test. */
const emit = (draft: Draft): string => {
  const read = emitKeyframes(draft);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** A draft with a long Intent, 25 decisions whose reasons wrap, and a few more items. */
const LONG: Draft = {
  name: 'inkwell',
  intent: Array.from({ length: 16 }, (_, index) => `Paragraph ${index + 1} of the Intent says one more thing about the notes.`).join('\n\n'),
  items: [
    { section: 'principles', slug: 'local-first', text: 'The device holds the truth.', because: null },
    ...Array.from({ length: 25 }, (_, index) => ({
      section: 'decisions' as const,
      slug: `call-${index + 1}`,
      text: `Decision ${index + 1} settles one more thing.`,
      because: `${'a reason long enough to wrap onto a second line under its decision, '.repeat(2)}so it does.`,
    })),
    { section: 'ideas', slug: 'sharing', text: 'A read-only link to one note.', because: null },
  ],
  open: [{ slug: 'appetite', text: 'How much time is it worth?', lean: 'A month of evenings.' }],
};

const TEXT = emit(LONG);
const CHUNKS = cutPlayback(TEXT);

/** The `## ` headings in a chunk. */
const headings = (chunk: string): readonly string[] => chunk.split('\n').filter((line) => line.startsWith('## '));

describe('cutPlayback', () => {
  test('every chunk holds at most 30 lines and ends "What\'s wrong or missing?"', () => {
    expect(CHUNKS.length).toBeGreaterThan(5);
    for (const chunk of CHUNKS) {
      expect(chunk.split('\n').length).toBeLessThanOrEqual(30);
      expect(chunk.endsWith(`\n\n${ENDING}`)).toBe(true);
    }
  });

  test('every chunk holds one section under its heading, a long one going over several, in order', () => {
    expect(CHUNKS.map((chunk) => headings(chunk))).toEqual(
      CHUNKS.map((chunk) => [chunk.split('\n').find((line) => line.startsWith('## '))]),
    );
    const sections = CHUNKS.map((chunk) => headings(chunk)[0]);
    expect([...new Set(sections)]).toEqual(['## Intent', '## Principles', '## Decisions', '## Questions', '## Ideas']);
    expect(sections.filter((heading) => heading === '## Intent').length).toBeGreaterThan(1);
    expect(sections.filter((heading) => heading === '## Decisions').length).toBeGreaterThan(1);
  });

  test('the title goes with the first chunk only', () => {
    expect(CHUNKS[0]?.startsWith('# inkwell\n\n## Intent\n\n')).toBe(true);
    expect(CHUNKS.slice(1).every((chunk) => !chunk.includes('# inkwell'))).toBe(true);
  });

  test('a section is cut only between items, so each decision stays with its because', () => {
    for (const chunk of CHUNKS.filter((each) => headings(each)[0] === '## Decisions')) {
      const body = chunk.split('\n').slice(2, -2);
      expect(body[0]).toMatch(/^- \*\*D\d+ /);
      expect(body.at(-1)).toMatch(/^ {4}\S/);
    }
  });

  test('the chunks hold every line of the draft once, in order', () => {
    const bodies = CHUNKS.flatMap((chunk, index) => {
      const lines = chunk.split('\n').slice(0, -2);
      const repeated = index > 0 && headings(chunk)[0] === headings(CHUNKS[index - 1] ?? '')[0];
      return repeated ? lines.slice(2) : lines;
    });
    expect(bodies.filter((line) => line !== '')).toEqual(TEXT.split('\n').filter((line) => line !== ''));
  });

  test('a short draft plays back one chunk a section', () => {
    const chunks = cutPlayback(emit({ ...LONG, intent: 'A notes app.', items: [LONG.items[0]!], open: [] }));
    expect(chunks).toEqual([
      `# inkwell\n\n## Intent\n\nA notes app.\n\n${ENDING}`,
      `## Principles\n\n- **P1 (local-first)**: The device holds the truth.\n\n${ENDING}`,
    ]);
  });

  test('the same text always cuts the same way', () => {
    expect(cutPlayback(TEXT)).toEqual(CHUNKS);
  });
});
