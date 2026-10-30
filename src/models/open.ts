import { create_engine, type Engine, type EngineConfig } from 'fascicle';

import type { Read } from '../brief/index.js';
import { classifyOn } from './classify.js';
import { draftOn } from './draft.js';
import { interpretOn } from './interpret.js';
import { phraseOn } from './phrase.js';

// The models edge, the only door to a model: one fascicle engine, with Ollama for the local model
// and Anthropic for the frontier one, both on fascicle's native transport, so no AI SDK is needed
// (D7 (native-transports)). Both model ids are settings, since the local one differs between
// machines. The wiring and the CLI take the four calls as one value, so a test hands them a fake
// in its place (D9 (models-injected)).

/** The four calls, and a way to let the engine go. */
export type Models = {
  readonly classify: ReturnType<typeof classifyOn>;
  readonly interpret: ReturnType<typeof interpretOn>;
  readonly phrase: ReturnType<typeof phraseOn>;
  readonly draft: ReturnType<typeof draftOn>;
  /** Lets the engine go. Calling it twice is harmless. */
  readonly dispose: () => Promise<void>;
};

/** Where each model is, and which it is. */
export type Settings = {
  readonly local: { readonly host: string; readonly model: string };
  readonly frontier: { readonly key: string; readonly model: string };
};

/** The environment's settings, by the variable each is read from. */
const VARIABLES = {
  STORYBOARD_LOCAL_MODEL: 'the local model, such as qwen3.6:35b',
  OLLAMA_HOST: "where Ollama runs, such as mini.local, or 127.0.0.1:11434 when it's this machine",
  STORYBOARD_FRONTIER_MODEL: 'the frontier model, such as claude-opus-5-5',
  ANTHROPIC_API_KEY: "the key for Anthropic's API",
} as const;

/** The port Ollama listens on when its host names none. */
const OLLAMA_PORT = '11434';

/**
 * Ollama's host as a URL, read the way Ollama reads `OLLAMA_HOST`: with no scheme, it's http on
 * Ollama's port unless one is given, and with one, it's taken as it is.
 */
const ollamaUrl = (host: string): string => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
    return host;
  }
  const [hostport = ''] = host.split('/');
  return /:\d+$/.test(hostport) ? `http://${hostport}` : `http://${hostport}:${OLLAMA_PORT}`;
};

/**
 * Reads the settings from the environment `env`, refusing with every variable that isn't set and
 * what it's for, so one run says all that's missing.
 */
export const settingsOf = (env: Readonly<Record<string, string | undefined>>): Read<Settings> => {
  const value = (name: string): string => env[name]?.trim() ?? '';
  const missing = Object.entries(VARIABLES).filter(([name]) => value(name) === '');
  if (missing.length > 0) {
    const lines = missing.map(([name, meaning]) => `  ${name}: ${meaning}`).join('\n');
    return { ok: false, problem: `storyboard needs ${missing.length === 1 ? 'this setting' : 'these settings'} in the environment:\n${lines}` };
  }
  return {
    ok: true,
    value: {
      local: { host: ollamaUrl(value('OLLAMA_HOST')), model: value('STORYBOARD_LOCAL_MODEL') },
      frontier: { key: value('ANTHROPIC_API_KEY'), model: value('STORYBOARD_FRONTIER_MODEL') },
    },
  };
};

/** The engine's config: Ollama and Anthropic, both on the native transport. */
export const engineConfig = ({ local, frontier }: Settings): EngineConfig => ({
  providers: {
    ollama: { base_url: local.host, transport: 'native' },
    anthropic: { api_key: frontier.key, transport: 'native' },
  },
});

/** The four calls on `engine`, `classify` on the local model and the rest on the frontier one. */
export const modelsOn = (engine: Engine, { local, frontier }: { readonly local: string; readonly frontier: string }): Models => ({
  classify: classifyOn(engine, local),
  interpret: interpretOn(engine, frontier),
  phrase: phraseOn(engine, frontier),
  draft: draftOn(engine, frontier),
  dispose: () => engine.dispose(),
});

/** Builds the one engine from the settings, and gives its four calls. Nothing reaches a model until a call runs. */
export const openModels = (settings: Settings): Models =>
  modelsOn(create_engine(engineConfig(settings)), { local: settings.local.model, frontier: settings.frontier.model });
