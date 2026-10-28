import { describe, expect, test } from 'vitest';

import { check, readVerdict, type Verdict } from '../keyframes.js';

/** A plan in `test/fixtures/plans/`. */
const plan = (name: string): string => new URL(`../../test/fixtures/plans/${name}/`, import.meta.url).pathname;

/** A `--json` report with these counts and findings. */
const report = (errors: number, warnings: number, findings: readonly unknown[] = []): string =>
  JSON.stringify({ schema_version: 1, plan: 'keyframes.md', errors, warnings, notes: 0, findings });

describe('check runs keyframes check --strict from its own dependency', () => {
  test('a clean plan exits 0, with nothing found', async () => {
    expect(await check(plan('clean'))).toEqual({ kind: 'checked', exit: 0, errors: 0, warnings: 0, notes: 0, findings: [] });
  });

  test('a broken plan exits 1, with its counts and every finding in line order', async () => {
    const verdict = await check(plan('broken'));
    expect(verdict).toMatchObject({ kind: 'checked', exit: 1, errors: 2, warnings: 3, notes: 0 });
    expect(verdict.kind === 'checked' && verdict.findings.map(({ line, severity, code }) => [line, severity, code])).toEqual([
      [9, 'error', 'broken-citation'],
      [13, 'warning', 'missing-because'],
      [14, 'error', 'duplicate-id'],
      [14, 'warning', 'missing-because'],
      [15, 'warning', 'unknown-key'],
    ]);
    expect(verdict.kind === 'checked' && verdict.findings[0]?.message).toBe('[P1 (local-first)] cites P1, but no item has that ID');
  });

  test('a folder with no plan comes back as no verdict, never a pass', async () => {
    const verdict = await check(plan('none'));
    expect(verdict).toMatchObject({ kind: 'no-verdict', exit: 2 });
    expect(verdict.kind === 'no-verdict' && verdict.problem).toContain("there's no keyframes.md to check");
  });

  test('a folder that is not there comes back as no verdict', async () => {
    expect(await check(plan('missing'))).toMatchObject({ kind: 'no-verdict', exit: 2 });
  });
});

describe('readVerdict believes a report only when it reads and agrees with its exit code', () => {
  const FINDING = { line: 3, severity: 'warning', code: 'missing-because', message: 'D1 says no why.' };

  test('a clean report with exit 0 is a pass, and a failing one with exit 1 is not', () => {
    expect(readVerdict(0, report(0, 0), '')).toEqual({ kind: 'checked', exit: 0, errors: 0, warnings: 0, notes: 0, findings: [] });
    expect(readVerdict(1, report(0, 1, [FINDING]), '')).toEqual({
      kind: 'checked',
      exit: 1,
      errors: 0,
      warnings: 1,
      notes: 0,
      findings: [FINDING],
    });
  });

  test.each<readonly [string, number | null, string, string, string]>([
    ['exit 2, saying why', 2, '', 'keyframes: no plan\n', 'keyframes: no plan'],
    ['exit 2, saying nothing', 2, '', '', 'keyframes check ended without a verdict (exit 2)'],
    ['no exit code, as when it was stopped', null, report(0, 0), '', 'keyframes check ended without a verdict (exit none)'],
    ['a report that is not JSON', 0, 'all good', '', "the report isn't JSON"],
    ['a report of another schema', 0, JSON.stringify({ schema_version: 2 }), '', "the report isn't keyframes' schema version 1"],
    ['a report with no counts', 0, JSON.stringify({ schema_version: 1, findings: [] }), '', "the report's counts or findings don't read"],
    ['a finding with no line', 1, report(1, 0, [{ ...FINDING, line: 0 }]), '', "the report's counts or findings don't read"],
    ['a finding of an unknown severity', 1, report(1, 0, [{ ...FINDING, severity: 'fatal' }]), '', "the report's counts or findings don't read"],
    ['exit 0 on a report with errors', 0, report(1, 0), '', 'keyframes check exited 0 on a report of 1 error and 0 warnings'],
    ['exit 0 on a report with warnings', 0, report(0, 2), '', 'keyframes check exited 0 on a report of 0 errors and 2 warnings'],
    ['exit 1 on a clean report', 1, report(0, 0), '', 'keyframes check exited 1 on a report of 0 errors and 0 warnings'],
  ])('%s is no verdict', (_name, exit, stdout, stderr, problem) => {
    expect(readVerdict(exit, stdout, stderr)).toEqual<Verdict>({ kind: 'no-verdict', exit, problem });
  });
});
