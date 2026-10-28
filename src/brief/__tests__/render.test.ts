import { describe, expect, test } from 'vitest';

import { readLog, renderBrief, replay, writeEntry, type Brief, type Entry } from '../index.js';
import { AT, SESSION, SLOTS } from './fixture.js';

/** The brief a log replays into; a log that won't replay fails the test. */
const brief = (entries: readonly Entry[]): Brief => {
  const read = replay(SLOTS, entries);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

describe('renderBrief', () => {
  test('a session renders every slot under its lens, with its status, asks, value and recommendation', () => {
    expect(renderBrief(brief(SESSION))).toBe(
      [
        '# Brief',
        '',
        "This is rendered from the answers log on every turn, so an edit here won't last. To change the",
        'brief, answer again.',
        '',
        'Work: library, medium.',
        '',
        '## Frame',
        '',
        '### problem: Clear, asked 2 times',
        '',
        'The problem it solves',
        '',
        '- Agents guess decisions a person never made.',
        '',
        'Recommended: Decisions get guessed.',
        '',
        '### audience: Clear, asked 2 times',
        '',
        "Who it's for",
        '',
        '- Rob, as the owner who signs the plan.',
        '',
        'Recommended: The owner',
        '',
        '### no-gos: Clear, asked once',
        '',
        'What it must never do',
        '',
        '- Never run in, draft for or write into a pilot repo.',
        '',
        '## Intent',
        '',
        '### principles: Missing, not asked yet',
        '',
        'What it holds to when two goods conflict',
        '',
        '### decisions: Missing, not asked yet',
        '',
        'The calls made, the options considered and why',
        '',
      ].join('\n'),
    );
  });

  test('before intake classifies the work, the brief says so', () => {
    expect(renderBrief(brief([]))).toContain('\nWork: not classified yet.\n');
  });

  test('a statement over several lines stays inside its list item', () => {
    const log: Entry[] = [
      { kind: 'asked', at: AT, questions: [{ id: 'q1', slots: ['principles'], text: 'Why?', options: [], recommended: null }] },
      {
        kind: 'answered',
        at: AT,
        answers: [{ question: 'q1', text: 'Because.' }],
        updates: [{ slot: 'principles', status: 'partial', value: ['Losing work is worse\nthan being slow.'] }],
      },
    ];
    expect(renderBrief(brief(log))).toContain('\n- Losing work is worse\n  than being slow.\n');
  });

  test('the same board renders byte-identical, however the log reached it', () => {
    const text = SESSION.map((entry) => {
      const line = writeEntry(entry);
      return line.ok ? line.value : '';
    }).join('');
    const read = readLog(text);
    const once = renderBrief(brief(SESSION));
    expect(renderBrief(brief(SESSION))).toBe(once);
    expect(read.ok && renderBrief(brief(read.value))).toBe(once);
    expect(renderBrief(brief(structuredClone(SESSION)))).toBe(once);
  });
});
