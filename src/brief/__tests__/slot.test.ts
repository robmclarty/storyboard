import { describe, expect, test } from 'vitest';

import { readSlot, type SlotRow } from '../index.js';

/** A row that reads, with `change` applied to it. */
const row = (change: Partial<SlotRow> = {}): SlotRow => ({
  id: 'no-gos',
  holds: 'What it must never do',
  impact: '2',
  lands: 'Constraints',
  ...change,
});

/** The problem reading a row refuses with, or undefined if it reads. */
const problem = (change: Partial<SlotRow>, lens = 'frame'): string | undefined => {
  const read = readSlot(lens, row(change));
  return read.ok ? undefined : read.problem;
};

describe('readSlot', () => {
  test('a row of a lens table reads into a typed slot', () => {
    expect(readSlot('frame', row())).toEqual({
      ok: true,
      value: { id: 'no-gos', lens: 'frame', holds: 'What it must never do', impact: 2, lands: 'constraints' },
    });
  });

  test('each cell is trimmed, as a markdown table pads it', () => {
    expect(readSlot('frame', { id: ' audience ', holds: " Who it's for ", impact: ' 3 ', lands: ' Intent ' })).toEqual({
      ok: true,
      value: { id: 'audience', lens: 'frame', holds: "Who it's for", impact: 3, lands: 'intent' },
    });
  });

  test.each([
    ['Intent', 'intent'],
    ['Principles', 'principles'],
    ['Constraints', 'constraints'],
    ['Decisions', 'decisions'],
    ['Taste', 'taste'],
    ['Questions', 'questions'],
    ['Ideas', 'ideas'],
    ['DECISIONS', 'decisions'],
    ['taste', 'taste'],
  ])('it lands in %s, read as %s', (lands, section) => {
    const read = readSlot('intent', row({ lands }));
    expect(read.ok && read.value.lands).toBe(section);
  });

  test.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
  ])('impact %s reads as %i', (impact, value) => {
    const read = readSlot('intent', row({ impact }));
    expect(read.ok && read.value.impact).toBe(value);
  });

  test.each([
    [{ id: 'No Gos' }, 'the slot "No Gos" isn\'t named as a slug'],
    [{ id: 'no_gos' }, 'the slot "no_gos" isn\'t named as a slug'],
    [{ id: '-no-gos' }, 'the slot "-no-gos" isn\'t named as a slug'],
    [{ id: '' }, 'the slot "" isn\'t named as a slug'],
    [{ holds: '   ' }, 'the slot "no-gos" doesn\'t say what it holds'],
    [{ impact: '0' }, 'the slot "no-gos" has impact "0", and an impact is 1, 2 or 3'],
    [{ impact: '4' }, 'has impact "4"'],
    [{ impact: '1.5' }, 'has impact "1.5"'],
    [{ impact: 'high' }, 'has impact "high"'],
    [{ impact: '' }, 'has impact ""'],
    [{ lands: 'Scenarios' }, 'lands in "Scenarios", which isn\'t one of Intent, Principles, Constraints, Decisions, Taste, Questions, Ideas'],
    [{ lands: 'Map' }, 'lands in "Map"'],
    [{ lands: '' }, 'lands in ""'],
  ])('a row with %j is refused', (change, expected) => {
    expect(problem(change)).toContain(expected);
  });

  test("a lens that isn't named as a slug is refused", () => {
    expect(problem({}, 'Frame Lens')).toBe('the lens "Frame Lens" isn\'t named as a slug: lowercase words joined by hyphens');
  });
});
