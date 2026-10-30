import type { Engine, GenerateOptions } from 'fascicle';
import { make_stub_engine, text_of } from 'fascicle/testing';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import type { Read } from '../../brief/index.js';
import { modelsOn, type Models } from '../index.js';

// The models edge's tests run on fascicle's stub engine, which answers a call by the first line of
// its system prompt and holds the canned reply to the call's own schema, as the real engine does.
// Nothing here reaches the network: every test file that uses this stubs `fetch` to fail, and checks
// it was never called.

/** The local and frontier model ids the tests use. */
export const LOCAL = 'qwen-test:1b';
export const FRONTIER = 'claude-test-1';

/** What reached the engine on one call, as the tests read it. */
export type Seen = {
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly system: string;
  readonly prompt: string;
  readonly schema: GenerateOptions['schema'];
  readonly max_tokens: number | undefined;
};

/** A stub engine that answers the call `name` with `reply`, and the calls it saw. */
const stub = (name: string, reply: unknown): { readonly engine: Engine; readonly seen: Seen[] } => {
  const seen: Seen[] = [];
  const engine = make_stub_engine([
    {
      prefix: `storyboard/${name}\n`,
      content: (opts) => {
        seen.push({
          provider: opts.provider,
          model: opts.model,
          system: opts.system ?? '',
          prompt: text_of(opts),
          schema: opts.schema,
          max_tokens: opts.max_tokens,
        });
        return reply;
      },
    },
  ]);
  return { engine, seen };
};

/** The four calls on a stub engine that answers the call `name` with `reply`, and the calls it saw. */
export const stubModels = (name: string, reply: unknown): { readonly models: Models; readonly seen: Seen[] } => {
  const { engine, seen } = stub(name, reply);
  return { models: modelsOn(engine, { local: LOCAL, frontier: FRONTIER }), seen };
};

/** The value a read gave, failing the test on a refusal. */
export const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** The problem a read refused with, failing the test on a value. */
export const problemOf = <T>(read: Read<T>): string => {
  if (read.ok) {
    throw new Error(`expected a refusal, and got ${JSON.stringify(read.value)}`);
  }
  return read.problem;
};

/** Stubs `fetch` to fail for every test in the file, and checks after each that nothing called it. */
export const offline = (): void => {
  const fetch = vi.fn(() => Promise.reject(new Error('a test reached the network')));
  beforeEach(() => {
    fetch.mockClear();
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    expect(fetch).not.toHaveBeenCalled();
  });
};
