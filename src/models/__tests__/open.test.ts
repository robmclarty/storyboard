import { make_stub_engine } from 'fascicle/testing';
import { describe, expect, test } from 'vitest';

import { modelsOn, openModels, settingsOf, type Models, type Settings } from '../index.js';
import { engineConfig } from '../open.js';
import { FRONTIER, LOCAL, offline, problemOf, valueOf } from './stub.js';

offline();

const ENV = {
  STORYBOARD_LOCAL_MODEL: 'qwen3.6:35b',
  OLLAMA_HOST: 'mini.local',
  STORYBOARD_FRONTIER_MODEL: 'claude-opus-5-5',
  ANTHROPIC_API_KEY: 'sk-test',
};

const SETTINGS: Settings = {
  local: { host: 'http://mini.local:11434', model: 'qwen3.6:35b' },
  frontier: { key: 'sk-test', model: 'claude-opus-5-5' },
};

describe('settingsOf', () => {
  test('reads the four settings from the environment', () => {
    expect(valueOf(settingsOf(ENV))).toEqual(SETTINGS);
  });

  test.each([
    ['mini.local', 'http://mini.local:11434'],
    ['127.0.0.1:11500', 'http://127.0.0.1:11500'],
    ['0.0.0.0', 'http://0.0.0.0:11434'],
    ['http://mini.local:8080', 'http://mini.local:8080'],
    ['https://ollama.example.com', 'https://ollama.example.com'],
    ['  mini.local  ', 'http://mini.local:11434'],
  ])('reads OLLAMA_HOST %j the way Ollama does, as %s', (host, url) => {
    expect(valueOf(settingsOf({ ...ENV, OLLAMA_HOST: host })).local.host).toBe(url);
  });

  test('names every setting that is missing or blank, and what each is for', () => {
    const problem = problemOf(settingsOf({ ...ENV, STORYBOARD_LOCAL_MODEL: undefined, ANTHROPIC_API_KEY: ' ' }));
    expect(problem).toContain('storyboard needs these settings in the environment');
    expect(problem).toContain('STORYBOARD_LOCAL_MODEL: the local model');
    expect(problem).toContain("ANTHROPIC_API_KEY: the key for Anthropic's API");
    expect(problem).not.toContain('OLLAMA_HOST');
    expect(problem).not.toContain('STORYBOARD_FRONTIER_MODEL');
  });

  test('names one missing setting on its own', () => {
    const { OLLAMA_HOST: _, ...rest } = ENV;
    expect(problemOf(settingsOf(rest))).toBe(
      "storyboard needs this setting in the environment:\n  OLLAMA_HOST: where Ollama runs, such as mini.local, or 127.0.0.1:11434 when it's this machine",
    );
  });
});

describe('the engine', () => {
  test('is one engine with Ollama and Anthropic, both on the native transport', () => {
    expect(engineConfig(SETTINGS)).toEqual({
      providers: {
        ollama: { base_url: 'http://mini.local:11434', transport: 'native' },
        anthropic: { api_key: 'sk-test', transport: 'native' },
      },
    });
  });

  test('opens and closes without reaching a model', async () => {
    const models = openModels(SETTINGS);
    expect(Object.keys(models).toSorted()).toEqual(['classify', 'dispose', 'draft', 'interpret', 'phrase']);
    await models.dispose();
    await models.dispose();
  });

  test('puts classify on the local model and the other three on the frontier one', async () => {
    const seen: [string, string | undefined, string | undefined][] = [];
    const replies: Readonly<Record<string, unknown>> = {
      classify: { work: 'library', size: 'medium' },
      interpret: { updates: [] },
      phrase: { questions: [{ slots: ['problem'], kind: 'open', text: 'Who has it?', options: [], recommended: 'You.' }] },
      draft: { intent: 'Notes.', items: [], open: [] },
    };
    const engine = make_stub_engine(
      Object.entries(replies).map(([name, reply]) => ({
        prefix: `storyboard/${name}\n`,
        content: (opts) => {
          seen.push([name, opts.provider, opts.model]);
          return reply;
        },
      })),
    );
    const models: Models = modelsOn(engine, { local: LOCAL, frontier: FRONTIER });
    const slot = { id: 'problem', holds: 'The problem', clear: 'Who and why.', status: 'missing', value: [] } as const;
    valueOf(await models.classify([]));
    valueOf(await models.interpret({ slots: [slot], said: [] }));
    valueOf(await models.phrase({ round: ['problem'], slots: [slot], bank: [], asked: [] }));
    valueOf(
      await models.draft({ work: null, size: null, slots: [], open: [], rubric: 'Rubric.', previous: null, corrections: [], findings: [] }),
    );
    expect(seen).toEqual([
      ['classify', 'ollama', LOCAL],
      ['interpret', 'anthropic', FRONTIER],
      ['phrase', 'anthropic', FRONTIER],
      ['draft', 'anthropic', FRONTIER],
    ]);
  });
});
