import type { Brief, SlotState } from './board.js';
import type { Status } from './log.js';

// `brief.md` is for a person to read. It's rendered from the board on every turn and never read
// back (D11 (log-is-truth)), so it holds nothing the log doesn't, and the same board always
// renders the same bytes.

const STATUS: Readonly<Record<Status, string>> = { clear: 'Clear', partial: 'Partial', missing: 'Missing' };

const HEADER = [
  '# Brief',
  '',
  "This is rendered from the answers log on every turn, so an edit here won't last. To change the",
  'brief, answer again.',
];

/** A word with its first letter in uppercase, as a heading writes it. */
const capital = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** How often a slot has been asked about, in words. */
const asked = (count: number): string => {
  if (count === 0) {
    return 'not asked yet';
  }
  return count === 1 ? 'asked once' : `asked ${count} times`;
};

/** A statement as a list item, any line after its first indented under it. */
const item = (statement: string): string => `- ${statement.replaceAll('\n', '\n  ')}`;

/** A slot's section: its id, status and asks, what it holds, its value and its recommendation. */
const slotLines = ({ slot, status, value, asked: count, recommended }: SlotState): readonly string[] => [
  '',
  `### ${slot.id}: ${STATUS[status]}, ${asked(count)}`,
  '',
  slot.holds,
  ...(value.length === 0 ? [] : ['', ...value.map(item)]),
  ...(recommended === null ? [] : ['', `Recommended: ${recommended}`]),
];

/** Renders the brief as `brief.md`: intake's read of the work, then each lens's slots in order. */
export const renderBrief = (brief: Brief): string => {
  const work =
    brief.work === null || brief.size === null
      ? "Work: not classified yet."
      : `Work: ${brief.work}, ${brief.size}.`;
  const lenses = [...new Set(brief.slots.map((state) => state.slot.lens))];
  const lines = [
    ...HEADER,
    '',
    work,
    ...lenses.flatMap((lens) => [
      '',
      `## ${capital(lens)}`,
      ...brief.slots.filter((state) => state.slot.lens === lens).flatMap(slotLines),
    ]),
  ];
  return `${lines.join('\n')}\n`;
};
