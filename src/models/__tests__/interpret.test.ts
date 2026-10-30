import { describe, expect, test } from 'vitest';

import type { Interpreting } from '../index.js';
import { FRONTIER, offline, problemOf, stubModels, valueOf } from './stub.js';

offline();

const INPUT: Interpreting = {
  slots: [
    { id: 'problem', holds: 'The problem it solves', clear: 'It says who has it and why today falls short.', status: 'missing', value: [] },
    { id: 'no-gos', holds: 'What it must never do', clear: 'Each is a line someone could cross.', status: 'partial', value: ['Be private.'] },
  ],
  said: [{ asked: 'What must it never do?', about: ['no-gos'], answer: 'Never send my notes off this laptop.' }],
};

describe('interpret', () => {
  test('reaches the frontier model with its schema, and gives the updates', async () => {
    const updates = [{ slot: 'no-gos', status: 'clear', value: ['Never sends a note off the laptop.'] }];
    const { models, seen } = stubModels('interpret', { updates });
    expect(valueOf(await models.interpret(INPUT))).toEqual(updates);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'anthropic', model: FRONTIER });
    expect(seen[0]?.schema).toBeDefined();
  });

  test("gives the model each slot's Clear line and value, and the answer word for word", async () => {
    const { models, seen } = stubModels('interpret', { updates: [] });
    valueOf(await models.interpret(INPUT));
    const prompt = seen[0]?.prompt ?? '';
    expect(prompt).toContain('"clear when": "Each is a line someone could cross."');
    expect(prompt).toContain('"Be private."');
    expect(prompt).toContain('Never send my notes off this laptop.');
  });

  test('takes a Missing slot with an empty value', async () => {
    const { models } = stubModels('interpret', { updates: [{ slot: 'problem', status: 'missing', value: [] }] });
    expect(valueOf(await models.interpret(INPUT))).toEqual([{ slot: 'problem', status: 'missing', value: [] }]);
  });

  test.each([
    ['a slot it was not given', [{ slot: 'taste', status: 'clear', value: ['Quiet.'] }], 'updates.0.slot'],
    ['a Clear slot with no value', [{ slot: 'no-gos', status: 'clear', value: [] }], 'updates.0.value'],
    ['a Missing slot with a value', [{ slot: 'problem', status: 'missing', value: ['Something.'] }], 'updates.0.value'],
    ['a status outside the three', [{ slot: 'problem', status: 'done', value: ['Something.'] }], 'updates.0.status'],
    ['a blank statement', [{ slot: 'problem', status: 'partial', value: ['  '] }], 'updates.0.value.0'],
    [
      'a slot updated twice',
      [
        { slot: 'no-gos', status: 'partial', value: ['One.'] },
        { slot: 'no-gos', status: 'clear', value: ['Two.'] },
      ],
      'the slot "no-gos" is updated twice',
    ],
  ])('refuses %s, never guessing a value', async (_, updates, said) => {
    const { models } = stubModels('interpret', { updates });
    const problem = problemOf(await models.interpret(INPUT));
    expect(problem).toContain(`interpret, on the frontier model ${FRONTIER}: its reply didn't fit its schema`);
    expect(problem).toContain(said);
  });
});
