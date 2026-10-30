import { incomplete_generation_error, provider_auth_error, provider_error, rate_limit_error } from 'fascicle';
import { make_script_engine } from 'fascicle/testing';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { ask } from '../call.js';
import { offline, problemOf, valueOf } from './stub.js';

offline();

const SCHEMA = z.object({ answer: z.string() });

/** Asks once on an engine that answers, or fails, as `reply` says. */
const askWith = (reply: unknown) =>
  ask(
    { engine: make_script_engine([reply]), provider: 'anthropic', model: 'claude-test-1', id: 'probe', system: 'storyboard/probe', schema: SCHEMA },
    'hello',
  );

describe('ask', () => {
  test("gives the reply its schema holds it to", async () => {
    expect(valueOf(await askWith({ answer: 'yes' }))).toEqual({ answer: 'yes' });
  });

  test.each([
    ['a reply that fails its schema', { answer: 3 }, "probe, on the frontier model claude-test-1: its reply didn't fit its schema: answer: "],
    [
      'a reply that stopped early',
      { throw: new incomplete_generation_error('length', '{"answer": "ye') },
      'probe, on the frontier model claude-test-1: its reply stopped before it was whole (length)',
    ],
    ['a provider that refused the key', { throw: new provider_auth_error('anthropic', 'bad key') }, 'the provider refused its key: bad key'],
    ['a provider limiting its rate', { throw: new rate_limit_error('slow down') }, 'the provider is limiting its rate: slow down'],
    ['a model that could not be reached', { throw: new provider_error('fetch failed', { cause_kind: 'network' }) }, "it couldn't be reached: fetch failed"],
  ])('refuses %s, naming the call and its model', async (_, reply, said) => {
    expect(problemOf(await askWith(reply))).toContain(said);
  });

  test('refuses on the local model by its name', async () => {
    const read = await ask(
      { engine: make_script_engine([{ answer: 3 }]), provider: 'ollama', model: 'qwen-test:1b', id: 'probe', system: 'storyboard/probe', schema: SCHEMA },
      'hello',
    );
    expect(problemOf(read)).toContain('probe, on the local model qwen-test:1b:');
  });

  test('throws an error no model call meets, since that is a bug', async () => {
    await expect(askWith({ throw: new TypeError('not a function') })).rejects.toThrow('not a function');
  });
});
