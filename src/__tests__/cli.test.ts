import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { run } from '../cli.js';

/** Runs the CLI with `argv` and collects what it wrote and the exit code it returned. */
const capture = (...argv: string[]): { code: number; stdout: string; stderr: string } => {
  let stdout = '';
  let stderr = '';
  const code = run(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
};

describe('run', () => {
  test.each([[], ['--help'], ['-h'], ['help']])('prints help for %j and exits 0', (...argv) => {
    const { code, stdout, stderr } = capture(...argv);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stderr).toBe('');
  });

  test('prints the version in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(capture('--version')).toEqual({ code: 0, stdout: `${pkg.version}\n`, stderr: '' });
  });

  test('names an unknown argument on stderr and exits 2', () => {
    const { code, stdout, stderr } = capture('interview');
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('unknown argument "interview"');
  });
});
