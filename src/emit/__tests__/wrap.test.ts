import { describe, expect, test } from 'vitest';

import { wrap } from '../wrap.js';

/** A run of words, `count` of them, each `size` letters long. */
const run = (count: number, size = 9): string => Array.from({ length: count }, () => 'x'.repeat(size)).join(' ');

describe('wrap', () => {
  test('short text stays on one line after its lead', () => {
    expect(wrap('- **P1 (a)**: ', 'Hold  the\nline.', '  ')).toEqual(['- **P1 (a)**: Hold the line.']);
  });

  test('long text fills each line to 100 columns, and every line after the first starts with the indent', () => {
    const lines = wrap('  - because: ', run(30), '    ');
    expect(lines.map((line) => line.length)).toEqual([92, 93, 93, 43]);
    expect(lines.slice(1).every((line) => line.startsWith('    x'))).toBe(true);
  });

  test.each(['-', '*', '+', '>', '#', '###', '1.', '12)'])('"%s" never starts a line, so it stays on the one before, past the width', (marker) => {
    const lines = wrap('', `${run(10)} ${marker} next`, '  ');
    expect(lines).toEqual([`${run(10)} ${marker}`, '  next']);
    expect(lines[0]?.length).toBeGreaterThan(100);
  });

  test('a word that only looks like a marker wraps as any word does', () => {
    expect(wrap('', `${run(10)} -x next`, '  ')).toEqual([run(10), '  -x next']);
  });

  test('a word longer than the width gets a line of its own', () => {
    const long = 'y'.repeat(120);
    expect(wrap('', `a ${long} b`, '')).toEqual(['a', long, 'b']);
  });
});
