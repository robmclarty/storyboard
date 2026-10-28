import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import manifest from '@robmclarty/keyframes/package.json' with { type: 'json' };

// The keyframes edge, the only module that starts a process: it runs `keyframes check` on a staged
// draft. The bin is storyboard's own dependency's, never one found on PATH, so the same draft gets
// the same verdict on every machine (D8 (three-deps)).

/** The bin `keyframes check` runs from, as the dependency's manifest names it. */
const BIN = fileURLToPath(import.meta.resolve(`@robmclarty/keyframes/${manifest.bin.keyframes}`));

/** How long a check may run before it's stopped, which reaches no verdict. */
const TIMEOUT = 30_000;

const SEVERITIES = ['error', 'warning', 'note'] as const;

/** One finding in the plan, as the report gives it. */
export type Finding = {
  /** The plan's line it's on, counting from 1. */
  readonly line: number;
  readonly severity: (typeof SEVERITIES)[number];
  /** Its stable code, such as `broken-citation`. */
  readonly code: string;
  readonly message: string;
};

/** What `keyframes check --strict` made of a plan, or why it made nothing of it. */
export type Verdict =
  | {
      readonly kind: 'checked';
      /** 0 for a clean plan; 1 for one with an error or, under `--strict`, a warning. */
      readonly exit: 0 | 1;
      readonly errors: number;
      readonly warnings: number;
      readonly notes: number;
      /** In the report's order: by line, then code, then message, with notes last. */
      readonly findings: readonly Finding[];
    }
  /**
   * No plan, an unreadable one, or a check that didn't finish or whose report didn't read. It's
   * never a pass, so a draft without a verdict can't be accepted.
   */
  | { readonly kind: 'no-verdict'; readonly exit: number | null; readonly problem: string };

type Report = Omit<Extract<Verdict, { kind: 'checked' }>, 'kind' | 'exit'>;

const isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const isCount = (raw: unknown): raw is number => typeof raw === 'number' && Number.isInteger(raw) && raw >= 0;

/** A count and its noun, such as "1 error" or "2 warnings". */
const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** A finding from the report, or undefined when it doesn't read as one. */
const findingOf = (raw: unknown): Finding | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const { line, severity, code, message } = raw;
  const known = SEVERITIES.find((each) => each === severity);
  return isCount(line) && line > 0 && known !== undefined && typeof code === 'string' && typeof message === 'string'
    ? { line, severity: known, code, message }
    : undefined;
};

/** The counts and findings of a `--json` report, or why it doesn't read. */
const reportOf = (stdout: string): Report | string => {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return "the report isn't JSON";
  }
  if (!isRecord(raw) || raw['schema_version'] !== 1) {
    return "the report isn't keyframes' schema version 1";
  }
  const { errors, warnings, notes, findings } = raw;
  const read = Array.isArray(findings) ? findings.map(findingOf) : [undefined];
  if (!isCount(errors) || !isCount(warnings) || !isCount(notes) || read.includes(undefined)) {
    return "the report's counts or findings don't read";
  }
  return { errors, warnings, notes, findings: read.filter((finding) => finding !== undefined) };
};

/**
 * The verdict a finished check gives, from its exit code and what it printed. A report is believed
 * only when its exit code agrees with its counts, so a garbled run never reads as a pass.
 */
export const readVerdict = (exit: number | null, stdout: string, stderr: string): Verdict => {
  if (exit !== 0 && exit !== 1) {
    const said = stderr.trim();
    return { kind: 'no-verdict', exit, problem: said === '' ? `keyframes check ended without a verdict (exit ${exit ?? 'none'})` : said };
  }
  const report = reportOf(stdout);
  if (typeof report === 'string') {
    return { kind: 'no-verdict', exit, problem: report };
  }
  const failed = report.errors + report.warnings > 0;
  return failed === (exit === 1)
    ? { kind: 'checked', exit, ...report }
    : {
        kind: 'no-verdict',
        exit,
        problem: `keyframes check exited ${exit} on a report of ${counted(report.errors, 'error')} and ${counted(report.warnings, 'warning')}`,
      };
};

/**
 * Runs `keyframes check --strict --json` on the plan in `dir`, such as a session's staged draft,
 * and gives its verdict: the exit code, the counts and the findings. A missing plan, or a check
 * that fails to run, comes back as no verdict.
 */
export const check = (dir: string): Promise<Verdict> =>
  new Promise((done) => {
    execFile(
      process.execPath,
      [BIN, 'check', resolve(dir), '--strict', '--json'],
      { encoding: 'utf8', timeout: TIMEOUT },
      (error, stdout, stderr) => {
        const exit = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
        done(readVerdict(exit, stdout, error !== null && stderr === '' ? error.message : stderr));
      },
    );
  });
