import { describe, expect, test } from 'vitest';

import type { Drafted, Drafting } from '../index.js';
import { FRONTIER, offline, problemOf, stubModels, valueOf } from './stub.js';

offline();

const INPUT: Drafting = {
  work: 'product',
  size: 'small',
  slots: [
    { id: 'problem', holds: 'The problem it solves', clear: 'Who, today, and why not.', status: 'clear', value: ['Notes get lost.'], lands: 'intent' },
    { id: 'decisions', holds: 'Calls already made', clear: 'What, against what, why.', status: 'clear', value: ['SQLite over files: one file to back up.'], lands: 'decisions' },
    { id: 'taste', holds: 'How it should feel', clear: 'Words someone could act on.', status: 'partial', value: ['Quiet.'], lands: 'taste' },
  ],
  open: ['taste'],
  rubric: '# Intent: rubric\n\nA good item picks a side.',
  previous: null,
  corrections: [],
  findings: [],
};

const DRAFTED: Drafted = {
  intent: 'Inkwell keeps one person’s notes where they can find them.',
  items: [{ section: 'decisions', slug: 'sqlite', text: 'Notes live in one SQLite file.', because: 'One file is one thing to back up.' }],
  open: [{ slot: 'taste', slug: 'how-it-feels', text: 'How should it feel to use, beyond quiet?' }],
};

describe('draft', () => {
  test('reaches the frontier model with its schema and room for a whole plan, and gives the items', async () => {
    const { models, seen } = stubModels('draft', DRAFTED);
    expect(valueOf(await models.draft(INPUT))).toEqual(DRAFTED);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'anthropic', model: FRONTIER, max_tokens: 16_000 });
    expect(seen[0]?.schema).toBeDefined();
  });

  test('gives the model the rubric, every slot with where it lands, and the open slots', async () => {
    const { models, seen } = stubModels('draft', DRAFTED);
    valueOf(await models.draft(INPUT));
    const prompt = seen[0]?.prompt ?? '';
    expect(prompt).toContain('A good item picks a side.');
    expect(prompt).toContain('The work: product, small.');
    expect(prompt).toContain('"lands in": "decisions"');
    expect(prompt).toContain('The open slots, each to get one question: taste.');
    expect(prompt).not.toContain('The draft before this one');
  });

  test('gives a redraft the draft before it, the corrections word for word, and the findings', async () => {
    const { models, seen } = stubModels('draft', DRAFTED);
    const redraft: Drafting = {
      ...INPUT,
      previous: '# inkwell\n\n## Intent\n\nNotes.\n',
      corrections: [{ chunk: '## Decisions\n\n- **D1 (sqlite)**: …', text: 'D1 should say why files lost.', items: ['D1'] }],
      findings: [{ line: 7, severity: 'error', code: 'over-budget', message: 'D1 is 61 words, over 60' }],
    };
    valueOf(await models.draft(redraft));
    const prompt = seen[0]?.prompt ?? '';
    expect(prompt).toContain('The draft before this one:\n\n# inkwell');
    expect(prompt).toContain('"text": "D1 should say why files lost."');
    expect(prompt).toContain('"code": "over-budget"');
  });

  test('takes a draft with no open slots when none is open', async () => {
    const { models } = stubModels('draft', { ...DRAFTED, open: [] });
    expect(valueOf(await models.draft({ ...INPUT, open: [] })).open).toEqual([]);
  });

  test.each([
    ['no Intent', { ...DRAFTED, intent: ' ' }, 'intent'],
    ['a decision that does not say why', { ...DRAFTED, items: [{ ...DRAFTED.items[0], because: null }] }, `the decision "sqlite" doesn't say why`],
    ['an item in a section the plan has no slot for', { ...DRAFTED, items: [{ ...DRAFTED.items[0], section: 'scenarios' }] }, 'items.0.section'],
    ['an open slot with no question', { ...DRAFTED, open: [] }, 'the open slot "taste" has no question'],
    ['an open slot asked about twice', { ...DRAFTED, open: [DRAFTED.open[0], DRAFTED.open[0]] }, 'the open slot "taste" has two questions'],
    ['a question for a slot that is not open', { ...DRAFTED, open: [{ ...DRAFTED.open[0], slot: 'problem' }] }, 'open.0.slot'],
  ])('refuses a draft with %s', async (_, reply, said) => {
    const { models } = stubModels('draft', reply);
    const problem = problemOf(await models.draft(INPUT));
    expect(problem).toContain(`draft, on the frontier model ${FRONTIER}: its reply didn't fit its schema`);
    expect(problem).toContain(said);
  });
});
