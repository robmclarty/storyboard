import { describe, expect, test } from 'vitest';

import { classified } from '../classify.js';
import type { Classified, Said } from '../index.js';
import { LOCAL, offline, problemOf, stubModels, valueOf } from './stub.js';

offline();

const SAID: readonly Said[] = [
  { asked: "What is it, and who's it for?", about: ['problem', 'audience'], answer: 'A notes app, for me alone.' },
  { asked: 'What must it never do?', about: ['no-gos'], answer: 'Never send my notes anywhere.' },
];

describe('classify', () => {
  test('reaches the local model with its schema, and gives the kind and size', async () => {
    const { models, seen } = stubModels('classify', { work: 'product', size: 'small' });
    const expected: Classified = { work: 'product', size: 'small' };
    expect(valueOf(await models.classify(SAID))).toEqual(expected);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'ollama', model: LOCAL, schema: classified });
    expect(seen[0]?.prompt).toContain('A notes app, for me alone.');
    expect(seen[0]?.prompt).toContain('Never send my notes anywhere.');
  });

  test('lists every kind and size in its system prompt', async () => {
    const { models, seen } = stubModels('classify', { work: 'event', size: 'tiny' });
    valueOf(await models.classify(SAID));
    for (const name of ['product', 'feature', 'library', 'game', 'content', 'event', 'tiny', 'small', 'medium', 'large']) {
      expect(seen[0]?.system).toContain(`- ${name}: `);
    }
  });

  test.each([
    ['a kind outside the six', { work: 'app', size: 'small' }, 'work'],
    ['a size outside the four', { work: 'product', size: 'huge' }, 'size'],
    ['no size', { work: 'product' }, 'size'],
  ])('refuses a reply with %s, naming the call and the field', async (_, reply, field) => {
    const { models } = stubModels('classify', reply);
    const problem = problemOf(await models.classify(SAID));
    expect(problem).toContain(`classify, on the local model ${LOCAL}: its reply didn't fit its schema`);
    expect(problem).toContain(field);
  });
});
