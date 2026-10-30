import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { make_stub_engine } from 'fascicle/testing';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { live, run, type Io, type Shell } from '../cli.js';
import { modelsOn } from '../models/index.js';

// The CLI's own work: its arguments, stdin, settings and output. The interview itself is the e2e
// test's. No call here reaches a model: the shell's models run on a stub engine with no replies, so
// a call that reached one would fail.

const ENV = {
  STORYBOARD_LOCAL_MODEL: 'qwen-test:1b',
  OLLAMA_HOST: 'mini.local',
  STORYBOARD_FRONTIER_MODEL: 'claude-test-1',
  ANTHROPIC_API_KEY: 'sk-test',
};

let cwd = '';
let disposed = 0;

/** A shell whose models can't answer, counting how often they're let go. */
const shell: Shell = {
  models: () => {
    const models = modelsOn(make_stub_engine([]), { local: 'qwen-test:1b', frontier: 'claude-test-1' });
    return {
      ...models,
      dispose: async () => {
        disposed += 1;
        await models.dispose();
      },
    };
  },
  now: () => '2026-10-29T12:00:00.000Z',
};

/** Runs the CLI with `argv`, stdin and the environment given, and collects what it wrote and its exit code. */
const capture = async (argv: readonly string[], { stdin = '', env = ENV }: { stdin?: string; env?: Io['env'] } = {}) => {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    stdin: () => Promise.resolve(stdin),
    env,
    cwd,
  };
  const code = await run(argv, io, shell);
  return { code, stdout, stderr };
};

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'storyboard-cli-'));
  disposed = 0;
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('run', () => {
  test.each([[], ['--help'], ['-h'], ['help'], ['turn', '--help']])('prints help for %j and exits 0', async (...argv) => {
    const { code, stdout, stderr } = await capture(argv);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('storyboard turn [slug] [--dir <project>] [--json] [--done] [--accept]');
    expect(stdout).toContain('STORYBOARD_FRONTIER_MODEL');
    expect(stderr).toBe('');
  });

  test('prints the version in package.json', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(await capture(['--version'])).toEqual({ code: 0, stdout: `${pkg.version}\n`, stderr: '' });
  });

  test('names an unknown argument on stderr and exits 2', async () => {
    const { code, stdout, stderr } = await capture(['interview']);
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('unknown argument "interview"');
  });
});

describe('storyboard turn', () => {
  test("asks intake's questions on the first call, in a session named for the project's folder", async () => {
    const { code, stdout, stderr } = await capture(['turn']);
    expect([code, stderr]).toEqual([0, '']);
    expect(stdout).toContain("intake-1: What is it, and who's it for?");
    expect(stdout).toContain('Answer in your own words on stdin, as {"intake-1": "…", "intake-2": "…", "intake-3": "…"}.');
    expect(await readdir(join(cwd, '.storyboard'))).toEqual([basename(cwd)]);
    expect(disposed).toBe(1);
  });

  test('takes the slug and the project folder it is given, the folder against where it runs', async () => {
    await mkdir(join(cwd, 'plans'));
    expect((await capture(['turn', 'inkwell', '--dir', 'plans'])).code).toBe(0);
    expect(await readdir(join(cwd, 'plans', '.storyboard'))).toEqual(['inkwell']);
  });

  test('prints what comes next as one JSON object under --json', async () => {
    const { code, stdout } = await capture(['turn', 'inkwell', '--json']);
    expect(code).toBe(0);
    const shown = JSON.parse(stdout) as { kind: string; lens: string; questions: { id: string }[] };
    expect([shown.kind, shown.lens, shown.questions.map((question) => question.id)]).toEqual(['questions', 'frame', ['intake-1', 'intake-2', 'intake-3']]);
  });

  test('exits 2 naming every model setting that is missing, before it writes anything', async () => {
    const { code, stdout, stderr } = await capture(['turn'], { env: { OLLAMA_HOST: 'mini.local', STORYBOARD_LOCAL_MODEL: 'q' } });
    expect([code, stdout]).toEqual([2, '']);
    expect(stderr).toContain('storyboard: storyboard needs these settings in the environment:');
    expect(stderr).toContain('STORYBOARD_FRONTIER_MODEL');
    expect(stderr).toContain('ANTHROPIC_API_KEY');
    expect(await readdir(cwd)).toEqual([]);
  });

  test('says what went wrong as JSON too under --json', async () => {
    const { code, stdout } = await capture(['turn', '--json'], { env: {} });
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ kind: 'error' });
  });

  test.each([
    ['not JSON', 'yes', "stdin isn't JSON"],
    ['a list', '["yes"]', "stdin isn't a JSON object"],
    ['an answer that is not text', '{"intake-1": 3}', 'the answer under "intake-1" isn\'t text'],
  ])('exits 2 on stdin that is %s', async (_, stdin, said) => {
    const { code, stderr } = await capture(['turn'], { stdin });
    expect(code).toBe(2);
    expect(stderr).toContain(said);
  });

  test('exits 2 on a turn that cannot go on, saying why', async () => {
    const { code, stderr } = await capture(['turn'], { stdin: '{"intake-1": "A notes app."}' });
    expect(code).toBe(2);
    expect(stderr).toBe("storyboard: no questions are waiting for answers, so these can't be taken: intake-1\n");
  });

  test.each([
    [['turn', '--dry'], "Unknown option '--dry'"],
    [['turn', 'one', 'two'], 'turn takes one slug at most, and was given 2: one two'],
  ])('exits 2 on the arguments %j', async (argv, said) => {
    const { code, stderr } = await capture(argv);
    expect(code).toBe(2);
    expect(stderr).toContain(said);
    expect(stderr).toContain('Usage:');
  });

  test('the live shell builds the real models without reaching one', async () => {
    const models = live.models({ local: { host: 'http://mini.local:11434', model: 'q' }, frontier: { key: 'sk-test', model: 'c' } });
    await models.dispose();
    expect(typeof live.now()).toBe('string');
  });
});
