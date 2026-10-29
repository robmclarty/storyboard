// The playback cutter. A draft comes back to the person a short chunk at a time, each ending with
// the same question, so they review a page and not the whole plan at once (C6 (short-playback)).

/** The most lines a chunk holds, its heading and its question included. */
const LINES = 30;

/** What every chunk ends with. */
const ENDING = "What's wrong or missing?";

/** Lines without the blank ones at either end. */
const trimmed = (lines: readonly string[]): readonly string[] => {
  const first = lines.findIndex((line) => line !== '');
  const last = lines.findLastIndex((line) => line !== '');
  return first === -1 ? [] : lines.slice(first, last + 1);
};

/** A section's body cut into blocks: an item with its sub-lines, or a paragraph. A block keeps the blank lines after it. */
const blocksOf = (body: readonly string[]): readonly (readonly string[])[] => {
  const starts = body.flatMap((line, index) =>
    index === 0 || line.startsWith('- ') || (line !== '' && body[index - 1] === '') ? [index] : [],
  );
  return starts.map((start, index) => body.slice(start, starts[index + 1]));
};

/**
 * A section's body packed into parts of at most `room` lines, cut only between blocks, so an item
 * stays with its sub-lines. A block too long for a part of its own is cut by lines.
 */
const pack = (body: readonly string[], room: number): readonly (readonly string[])[] => {
  const parts: (readonly string[])[] = [];
  let part: readonly string[] = [];
  for (const block of blocksOf(body)) {
    if (trimmed(part).length > 0 && trimmed([...part, ...block]).length > room) {
      parts.push(trimmed(part));
      part = [];
    }
    part = [...part, ...block];
    while (trimmed(part).length > room) {
      parts.push(trimmed(part).slice(0, room));
      part = trimmed(part).slice(room);
    }
  }
  return trimmed(part).length > 0 || parts.length === 0 ? [...parts, trimmed(part)] : parts;
};

/** One chunk: the section's heading, its part, and the question, a blank line between each. */
const chunkOf = (head: readonly string[], part: readonly string[]): string =>
  [head, part, [ENDING]]
    .filter((block) => block.length > 0)
    .map((block) => block.join('\n'))
    .join('\n\n');

/**
 * Cuts an emitted draft into playback chunks. Each holds at most one section and 30 lines, and
 * ends "What's wrong or missing?". A section too long for one chunk goes over several, cut
 * between items and each under the section's heading; the title goes with the first section.
 */
export const cutPlayback = (text: string): readonly string[] => {
  const lines = text.split('\n');
  const starts = lines.flatMap((line, index) => (line.startsWith('## ') ? [index] : []));
  const bounds = starts.length === 0 ? [0] : [0, ...starts.slice(1)];
  return bounds.flatMap((start, index) => {
    const section = lines.slice(start, bounds[index + 1]);
    const heading = section.findIndex((line) => line.startsWith('## ')) + 1;
    const head = trimmed(section.slice(0, heading));
    const body = trimmed(section.slice(heading));
    return pack(body, Math.max(1, LINES - head.length - 3)).map((part, cut) => chunkOf(cut === 0 ? head : head.slice(-1), part));
  });
};
