import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { runTurn, type Shown } from './flow.js';
import { openModels, settingsOf, type Models, type Settings } from './models/index.js';

/** Where the CLI reads and writes: stdout for what was asked for, stderr for usage problems and errors. */
export type Io = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Everything piped in on stdin, or nothing when nothing was. */
  readonly stdin: () => Promise<string>;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The folder the command runs in, which is the project unless `--dir` names another. */
  readonly cwd: string;
};

/** What the CLI reaches beyond its io: the models, built from the settings, and the clock (D9 (models-injected)). */
export type Shell = {
  readonly models: (settings: Settings) => Models;
  /** The time, as the log stamps it. */
  readonly now: () => string;
};

/** The real models, on the engine the settings describe, and the real clock. The bin passes this. */
export const live: Shell = { models: openModels, now: () => new Date().toISOString() };

const USAGE = `Usage:
  storyboard turn [slug] [--dir <project>] [--json] [--done] [--accept]
  storyboard --help | --version
`;

const HELP = `storyboard interviews a person broad to narrow, then drafts the intent, spec, design and
map the rest of the toolchain builds from.

${USAGE}
storyboard turn runs one turn of the interview for the session <slug>, which is the project
folder's name unless you give one. Its files are in <project>/.storyboard/<slug>/. Answers come in
on stdin as a JSON object keyed by the id of what was shown: a question's, or a chunk's while the
draft plays back. A blank reply to a chunk passes it, and anything else corrects it. With no
answers, it shows what's waiting again.

  --dir <project>  the project being planned (default: this folder)
  --json           print what comes next as JSON, for a front end
  --done           stop asking and draft now
  --accept         write the draft to <project>/keyframes.md, when its check is clean

It needs four settings in the environment:

  STORYBOARD_LOCAL_MODEL     the local model, such as qwen3.6:35b
  OLLAMA_HOST                where Ollama runs, such as mini.local
  STORYBOARD_FRONTIER_MODEL  the frontier model, such as claude-opus-5-5
  ANTHROPIC_API_KEY          the key for Anthropic's API

Exit codes:
  0  success
  1  the accept was refused: the draft's check isn't clean, or keyframes.md is already there
  2  a usage problem, a missing setting, a turn that can't go on, or an unexpected error
`;

/** The package's version, if package.json has one. It sits one level above both src/ and dist/. */
const version = (): string | undefined => {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string'
    ? pkg.version
    : undefined;
};

/** What `storyboard turn` was asked to do. */
type Turn = {
  readonly slug: string | undefined;
  readonly dir: string | undefined;
  readonly json: boolean;
  readonly done: boolean;
  readonly accept: boolean;
};

/** Reads the arguments after `turn`, or says what's wrong with them. */
const turnArgs = (args: readonly string[]): Turn | string => {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        dir: { type: 'string' },
        json: { type: 'boolean', default: false },
        done: { type: 'boolean', default: false },
        accept: { type: 'boolean', default: false },
      },
    });
    if (positionals.length > 1) {
      return `turn takes one slug at most, and was given ${positionals.length}: ${positionals.join(' ')}`;
    }
    return { slug: positionals[0], dir: values.dir, json: values.json, done: values.done, accept: values.accept };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** The answers piped in: a JSON object of text by id, or nothing at all. */
const answersOf = (text: string): Readonly<Record<string, string>> | string => {
  if (text.trim() === '') {
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "stdin isn't JSON: answers come as an object keyed by id, such as {\"intake-1\": \"…\"}";
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return "stdin isn't a JSON object: answers come keyed by id, such as {\"intake-1\": \"…\"}";
  }
  const answers = Object.entries(raw);
  const odd = answers.find(([, value]) => typeof value !== 'string');
  if (odd !== undefined) {
    return `the answer under "${odd[0]}" isn't text`;
  }
  return Object.fromEntries(answers.flatMap(([id, value]) => (typeof value === 'string' ? [[id, value]] : [])));
};

/** A word with its first letter in uppercase. */
const capital = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** A round of questions as text: each id and question, a menu's options with the recommended one marked. */
const questionsText = ({ lens, questions }: Extract<Shown, { kind: 'questions' }>): string => {
  const blocks = questions.map(({ id, text, options, recommended }) => {
    const menu = options.map((option) => `  - ${option}${option === recommended ? ' (recommended)' : ''}`);
    const lean = recommended === null || options.includes(recommended) ? [] : [`  Recommended: ${recommended}`];
    return [`${id}: ${text}`, ...menu, ...lean].join('\n');
  });
  const ids = questions.map((question) => `"${question.id}": "…"`).join(', ');
  return [`${capital(lens)}, ${questions.length === 1 ? 'one question' : `${questions.length} questions`}:`, ...blocks, `Answer in your own words on stdin, as {${ids}}.`].join('\n\n');
};

/** What a turn shows, as text for a person at a terminal. */
const textOf = (shown: Shown): string => {
  switch (shown.kind) {
    case 'questions':
      return questionsText(shown);
    case 'chunk':
      return [
        `Chunk ${shown.place} of ${shown.of} of the draft:`,
        shown.text,
        `Reply on stdin as {"${shown.id}": "…"}: a blank reply passes it, and anything else corrects it.`,
      ].join('\n\n');
    case 'accept':
      return `The playback is over with nothing corrected. Run storyboard turn --accept to write keyframes.md, or correct the last chunk on stdin as {"${shown.id}": "…"}.`;
    case 'accepted':
      return `Accepted: the plan is at ${shown.path}.`;
    case 'refused':
      return shown.problem;
    case 'no-planner':
      return shown.message;
    default:
      return '';
  }
};

/** Runs `storyboard turn` with what follows it, and returns its exit code. */
const turn = async (args: readonly string[], io: Io, shell: Shell): Promise<number> => {
  const parsed = turnArgs(args);
  if (typeof parsed === 'string') {
    io.stderr(`storyboard: ${parsed}\n\n${USAGE}`);
    return 2;
  }
  const fail = (problem: string): number => {
    io.stderr(`storyboard: ${problem}\n`);
    if (parsed.json) {
      io.stdout(`${JSON.stringify({ kind: 'error', problem })}\n`);
    }
    return 2;
  };
  const settings = settingsOf(io.env);
  if (!settings.ok) {
    return fail(settings.problem);
  }
  const answers = answersOf(await io.stdin());
  if (typeof answers === 'string') {
    return fail(answers);
  }
  const project = resolve(io.cwd, parsed.dir ?? '.');
  const models = shell.models(settings.value);
  try {
    const shown = await runTurn(
      { models, now: shell.now },
      { project, slug: parsed.slug ?? basename(project), answers, done: parsed.done, accept: parsed.accept },
    );
    if (!shown.ok) {
      return fail(shown.problem);
    }
    io.stdout(parsed.json ? `${JSON.stringify(shown.value)}\n` : `${textOf(shown.value)}\n`);
    return shown.value.kind === 'refused' ? 1 : 0;
  } finally {
    await models.dispose();
  }
};

/**
 * Runs one command line and returns its exit code. It never exits the process itself, so the
 * bin, a test or another host can each decide what to do with the code.
 */
export const run = async (argv: readonly string[], io: Io, shell: Shell): Promise<number> => {
  if (argv.length === 0 || argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) {
    io.stdout(HELP);
    return 0;
  }
  if (argv[0] === 'turn') {
    return turn(argv.slice(1), io, shell);
  }
  if (argv.includes('--version')) {
    const found = version();
    if (found === undefined) {
      io.stderr('storyboard: package.json has no version\n');
      return 2;
    }
    io.stdout(`${found}\n`);
    return 0;
  }
  io.stderr(`storyboard: unknown argument "${argv[0] ?? ''}"\n\n${USAGE}`);
  return 2;
};
