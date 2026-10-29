// Lines of `keyframes.md` wrap at 100 columns, as a plan written by hand does, so a person can read
// and edit the draft they sign, and a playback's line count means something.

const WIDTH = 100;

/** A word that markdown would read as its own syntax at the start of a line: a bullet, a heading, a numbered item or a quote. */
const MARKER = /^(?:[-*+>]|#{1,6}|\d{1,9}[.)])$/;

/** The words of a text, whatever spaces and line breaks were between them. */
export const words = (text: string): readonly string[] => text.split(/\s+/).filter((word) => word !== '');

/**
 * Wraps `text` after `lead` at 100 columns, starting each line after the first with `indent`. A
 * line never starts with a word markdown would read as a bullet, a heading, a numbered item or a
 * quote, which would end an item or open a sub-line; such a word stays on the line before, even
 * past the width. A word longer than the width gets a line of its own.
 */
export const wrap = (lead: string, text: string, indent: string): readonly string[] => {
  const lines: string[] = [];
  let start = lead;
  let line = '';
  for (const word of words(text)) {
    if (line !== '' && start.length + line.length + 1 + word.length > WIDTH && !MARKER.test(word)) {
      lines.push(`${start}${line}`);
      start = indent;
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  return [...lines, `${start}${line}`];
};
