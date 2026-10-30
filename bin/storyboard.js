#!/usr/bin/env node
// The storyboard command. All of its behavior lives in src/cli.ts, which returns
// the exit code; this file only connects it to the process, and passes it the
// real models and clock.
import { live, run } from '../dist/cli.js';

// A stream can fail after run() returns, as stdout does when a reader such as
// `head` closes it early. That's an unexpected error, so it prints one line and
// exits 2, rather than a stack trace.
process.stdout.on('error', (error) => {
  process.stderr.write(`storyboard: ${error.message}\n`);
  process.exitCode = 2;
});
process.stderr.on('error', () => {
  process.exitCode = 2;
});

/** Everything piped in on stdin, or nothing when it's a terminal, so a bare call never waits on one. */
const stdin = async () => {
  if (process.stdin.isTTY) {
    return '';
  }
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
};

try {
  process.exitCode = await run(
    process.argv.slice(2),
    {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      stdin,
      env: process.env,
      cwd: process.cwd(),
    },
    live,
  );
} catch (error) {
  process.stderr.write(`storyboard: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
