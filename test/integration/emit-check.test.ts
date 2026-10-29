import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { cutPlayback, emitKeyframes, type Draft } from '../../src/emit/index.js';
import { check } from '../../src/keyframes.js';

// The emitter claims every draft it writes is in keyframes' usual form (D2 (draft-as-data)). Only
// keyframes can say so, so each draft here is emitted into a temp directory and checked there by
// the real `keyframes check --strict`, through the edge the flow will use.

type Item = Draft['items'][number];

const item = (section: Item['section'], slug: string, text: string, because: string | null = null): Item => ({ section, slug, text, because });

/** A long run of prose, with words that would read as markdown at the start of a line. */
const PROSE = Array.from({ length: 6 }, (_, index) => `Part ${index + 1} - of the reason, step 1. # and > and * all stay prose`).join(' ');

/** The first `count` words of the prose: an item's text stays inside keyframes' 60-word budget. */
const SHORT = (count: number): string => PROSE.split(' ').slice(0, count).join(' ');

const FULL: Draft = {
  name: 'inkwell',
  intent: "Inkwell keeps one person's notes in step between a phone and a laptop.\n\nIt isn't a team wiki.",
  items: [
    item('principles', 'Local First', 'The device holds the truth; the server only relays.'),
    item('constraints', 'one-writer', 'Only the sync worker writes to the database, per the principle above.', 'two writers made the replay disagree.'),
    item('decisions', 'SQLite', 'Each device keeps its notes in one SQLite file.', 'one file is easy to back up.'),
    item('decisions', 'sqlite', 'The server keeps only the relay queue.', 'it only relays.'),
    item('taste', 'café crème', 'Warm, quiet and never in the way.'),
    item('questions', 'merging', 'How should two edits to the same line merge?'),
    item('ideas', '!!!', 'A read-only link to one note.'),
  ],
  open: [
    { slug: 'appetite', text: 'How much time is it worth?', lean: 'A month of evenings.' },
    { slug: 'audience', text: 'Who else is it for?', lean: null },
    { slug: 'no-gos', text: 'What must it never do?', lean: 'Lose an edit: - never.' },
  ],
};

const DRAFTS: Readonly<Record<string, Draft>> = {
  'only an Intent': { name: 'tiny', intent: 'A one-page tool.', items: [], open: [] },
  'every section, with open slots': FULL,
  'long text that wraps': {
    name: 'long',
    intent: `# ${PROSE}\n\n${PROSE}`,
    items: [item('principles', 'long', SHORT(55)), item('decisions', 'long', SHORT(55), PROSE)],
    open: [{ slug: 'long', text: `${SHORT(40)}?`, lean: SHORT(15) }],
  },
};

const ROOTS: string[] = [];

/** Emits a draft into a new temp directory as its `keyframes.md`, and returns the directory. */
const stage = (draft: Draft): string => {
  const read = emitKeyframes(draft);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  const root = mkdtempSync(join(tmpdir(), 'storyboard-emit-'));
  ROOTS.push(root);
  writeFileSync(join(root, 'keyframes.md'), read.value);
  return root;
};

afterAll(() => {
  for (const root of ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('keyframes check --strict passes every emitted draft', () => {
  test.each(Object.entries(DRAFTS))('%s exits 0 with nothing found', async (_name, draft) => {
    expect(await check(stage(draft))).toEqual({ kind: 'checked', exit: 0, errors: 0, warnings: 0, notes: 0, findings: [] });
  });

  test('a draft cut for playback still checks clean once its chunks are put back together', async () => {
    const read = emitKeyframes(FULL);
    const chunks = read.ok ? cutPlayback(read.value) : [];
    const joined = chunks.map((chunk) => chunk.split('\n').slice(0, -2).join('\n')).join('\n\n');
    const root = mkdtempSync(join(tmpdir(), 'storyboard-emit-'));
    ROOTS.push(root);
    writeFileSync(join(root, 'keyframes.md'), `${joined}\n`);
    expect(await check(root)).toMatchObject({ kind: 'checked', exit: 0 });
  });
});
