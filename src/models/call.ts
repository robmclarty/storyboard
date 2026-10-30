import {
  incomplete_generation_error,
  model_step,
  provider_auth_error,
  provider_error,
  rate_limit_error,
  run,
  schema_validation_error,
  turn_timeout_error,
  type Engine,
  type SchemaIssue,
  type ToolSchema,
} from 'fascicle';

import type { Read } from '../brief/index.js';

// Every call runs one `model_step`: a system prompt whose first line names the call, a zod schema
// the engine holds the reply to, and the user message assembled for it. A reply that fails its
// schema, after the engine's one repair pass, comes back as a refusal, never as a value the edge
// guessed at. So does a model that can't be reached. Anything else is a bug, and throws.

/** Which model a call reaches, the local one or the frontier one, and the model's id. */
export type Reach = { readonly provider: 'ollama' | 'anthropic'; readonly model: string };

/** One call to a model, as a `model_step` is configured. */
type Call<T> = Reach & {
  readonly engine: Engine;
  /** The call's name, which is also the first line of its system prompt after `storyboard/`. */
  readonly id: string;
  readonly system: string;
  readonly schema: ToolSchema<T>;
  readonly max_tokens?: number;
};

/** How many issues a refusal names before it stops. */
const ISSUES = 3;

/** A schema issue, such as `updates.0.status: Invalid option`. */
const issueOf = ({ path, message }: SchemaIssue): string =>
  path === undefined || path.length === 0 ? message : `${path.map(String).join('.')}: ${message}`;

/** What went wrong, for a refusal, when the error is one a model call can meet; undefined for a bug. */
const problemOf = (error: unknown): string | undefined => {
  if (error instanceof schema_validation_error) {
    const issues = error.schema_issues.slice(0, ISSUES).map(issueOf).join('; ');
    return `its reply didn't fit its schema: ${issues === '' ? error.message : issues}`;
  }
  if (error instanceof incomplete_generation_error) {
    return `its reply stopped before it was whole (${error.finish_reason})`;
  }
  if (error instanceof provider_auth_error) {
    return `the provider refused its key: ${error.message}`;
  }
  if (error instanceof rate_limit_error) {
    return `the provider is limiting its rate: ${error.message}`;
  }
  if (error instanceof provider_error || error instanceof turn_timeout_error) {
    return `it couldn't be reached: ${error.message}`;
  }
  return undefined;
};

/** Where a call went, for a refusal: `classify, on the local model qwen3.6:35b`. */
const whereOf = ({ id, provider, model }: Reach & { readonly id: string }): string =>
  `${id}, on the ${provider === 'ollama' ? 'local' : 'frontier'} model ${model}`;

/** Runs one call with `prompt` as its user message, giving the reply its schema holds it to. */
export const ask = async <T>(call: Call<T>, prompt: string): Promise<Read<T>> => {
  const step = model_step({ ...call, schema_repair_attempts: 1 });
  try {
    return { ok: true, value: await run(step, prompt, { install_signal_handlers: false }) };
  } catch (error) {
    const problem = problemOf(error);
    if (problem === undefined) {
      throw error;
    }
    return { ok: false, problem: `${whereOf(call)}: ${problem}` };
  }
};

/** A value as indented JSON, for a user message. */
export const json = (value: unknown): string => JSON.stringify(value, null, 2);
