import { describe, expect, test } from 'vitest';

import type { BankQuestion, Phrased, Phrasing, SlotView } from '../index.js';
import { FRONTIER, offline, problemOf, stubModels, valueOf } from './stub.js';

offline();

const SLOTS: readonly SlotView[] = [
    { id: 'problem', holds: 'The problem it solves', clear: 'Who has it, and why today falls short.', status: 'partial', value: ['Notes get lost.'] },
    { id: 'principles', holds: 'Values that settle a call', clear: 'A value with a side picked.', status: 'missing', value: [] },
    { id: 'decisions', holds: 'Calls already made', clear: 'Each says what, against what, and why.', status: 'missing', value: [] },
];

const BANK: readonly BankQuestion[] = [
    { id: 'intake-1', kind: 'intake', slots: ['problem'], text: "What is it, and who's it for?", options: [], recommended: null },
    {
      id: 'principles-pick',
      kind: 'menu',
      slots: ['principles'],
      text: 'When two good things conflict, which wins?',
      options: ['Simple over complete', 'Complete over simple'],
      recommended: 'Simple over complete',
    },
    { id: 'decisions-made', kind: 'open', slots: ['decisions'], text: "What's already decided?", options: [], recommended: 'Nothing yet.' },
];

const INPUT: Phrasing = { round: ['principles', 'decisions'], slots: SLOTS, bank: BANK, asked: ["What is it, and who's it for?"] };

const MENU = {
  slots: ['principles'],
  kind: 'menu',
  text: 'When keeping your notes simple and complete conflict, which wins?',
  options: ['Simple over complete', 'Complete over simple'],
  recommended: 'Simple over complete',
};

const OPEN = { slots: ['decisions'], kind: 'open', text: 'What have you already decided about it?', options: [], recommended: 'Nothing is settled yet.' };

describe('phrase', () => {
  test('reaches the frontier model with its schema, and gives the questions without their kind', async () => {
    const { models, seen } = stubModels('phrase', { questions: [MENU, OPEN] });
    const { kind: _menu, ...menu } = MENU;
    const { kind: _open, ...open } = OPEN;
    const expected: readonly Phrased[] = [menu, open];
    expect(valueOf(await models.phrase(INPUT))).toEqual(expected);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'anthropic', model: FRONTIER });
    expect(seen[0]?.schema).toBeDefined();
  });

  test("gives the model the round, its bank questions but not intake's, the brief and what's been asked", async () => {
    const { models, seen } = stubModels('phrase', { questions: [OPEN] });
    valueOf(await models.phrase(INPUT));
    const prompt = seen[0]?.prompt ?? '';
    expect(prompt).toContain('in this order: principles, decisions.');
    expect(prompt).toContain('"id": "principles-pick"');
    expect(prompt).not.toContain('"id": "intake-1"');
    expect(prompt).toContain('"Notes get lost."');
    expect(prompt).toContain(JSON.stringify("What is it, and who's it for?"));
  });

  test.each([
    ['no questions', [], 'questions'],
    ['more questions than the round has slots', [MENU, OPEN, { ...OPEN, slots: ['principles'] }], 'questions'],
    ['a slot outside the round', [{ ...OPEN, slots: ['problem'] }], 'questions.0.slots.0'],
    ['two questions about one slot', [MENU, { ...OPEN, slots: ['principles'] }], 'two questions ask about "principles"'],
    ['a menu of one option', [{ ...MENU, options: ['Simple over complete'] }], 'is a menu of 1 options'],
    ['a menu of five options', [{ ...MENU, options: ['a', 'b', 'c', 'd', 'Simple over complete'] }], 'questions.0.options'],
    ['a menu recommending something it does not offer', [{ ...MENU, recommended: 'Both' }], 'recommends "Both"'],
    ['an open question with options', [{ ...OPEN, options: ['Yes', 'No'] }], 'is open, and it has 2 options'],
    ['a question that recommends nothing', [{ ...OPEN, recommended: '' }], 'questions.0.recommended'],
  ])('refuses a round with %s', async (_, questions, said) => {
    const { models } = stubModels('phrase', { questions });
    const problem = problemOf(await models.phrase(INPUT));
    expect(problem).toContain(`phrase, on the frontier model ${FRONTIER}: its reply didn't fit its schema`);
    expect(problem).toContain(said);
  });
});
