import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readSlot, renderBrief, replay, writeEntry, type Brief, type Entry, type Read, type Slot } from '../brief/index.js';
import { openStore, type Store } from '../store.js';

// Each test runs in a temp directory that stands in for the project, and lists it after each call,
// so a path the store wrote that it shouldn't have shows up by name (C4 (write-on-accept)).

const AT = '2026-10-29T10:00:00.000Z';

const SLOTS: readonly Slot[] = [
  { id: 'problem', holds: 'The problem it solves', impact: '3', lands: 'Intent' },
  { id: 'no-gos', holds: 'What it must never do', impact: '2', lands: 'Constraints' },
].map((row) => {
  const read = readSlot('frame', row);
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
});

/** A short session: intake asked and answered, the work classified, then done and drafted. */
const SESSION: readonly Entry[] = [
  {
    kind: 'asked',
    call: 1,
    at: AT,
    questions: [
      { id: 'intake-1', slots: ['problem'], text: "What is it, and who's it for?", options: [], recommended: null },
      { id: 'intake-3', slots: ['no-gos'], text: 'What must it never do?', options: [], recommended: null },
    ],
  },
  {
    kind: 'answered',
    call: 2,
    at: AT,
    answers: [
      { question: 'intake-1', text: 'A planner that interviews me.' },
      { question: 'intake-3', text: 'Never touch the pilot repos.' },
    ],
    updates: [
      { slot: 'problem', status: 'partial', value: ['Plans written by hand lose what was said.'] },
      { slot: 'no-gos', status: 'clear', value: ['Never write into a pilot repo.'] },
    ],
  },
  { kind: 'classified', call: 2, at: AT, work: 'library', size: 'medium' },
  { kind: 'done', call: 3, at: AT },
  { kind: 'drafted', call: 3, at: AT, chunks: ["# inkwell\n\nWhat's wrong or missing?"] },
];

const DRAFT = '# inkwell\n\n## Intent\n\nInkwell keeps one person’s notes in step.\n';

const SESSION_DIR = ['.storyboard', '.storyboard/inkwell'];

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** The brief the slots and these entries give. */
const briefOf = (entries: readonly Entry[]): Brief => valueOf(replay(SLOTS, entries));

let project = '';
let store: Store;

/** Every path under the project, folders included, relative to it and sorted. */
const listing = async (): Promise<readonly string[]> => (await readdir(project, { recursive: true })).toSorted();

/** A file under the project, as text. */
const read = (path: string): Promise<string> => readFile(join(project, path), 'utf8');

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'storyboard-store-'));
  store = valueOf(openStore(project, 'inkwell'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

describe('a whole session writes only its own folder until it is accepted', () => {
  test('each call leaves exactly the paths it names, and accepting adds only keyframes.md', async () => {
    const LOG = [...SESSION_DIR, '.storyboard/inkwell/answers.jsonl'];
    expect(valueOf(await store.load())).toEqual([]);
    expect(await listing()).toEqual([]);

    for (const entry of SESSION) {
      valueOf(await store.append(entry));
      expect(await listing()).toEqual(LOG);
    }

    valueOf(await store.render(briefOf(SESSION)));
    const BRIEF = [...LOG, '.storyboard/inkwell/brief.md'].toSorted();
    expect(await listing()).toEqual(BRIEF);

    expect(valueOf(await store.stage(DRAFT))).toBe(join(project, '.storyboard/inkwell/draft'));
    const STAGED = [...BRIEF, '.storyboard/inkwell/draft', '.storyboard/inkwell/draft/keyframes.md'].toSorted();
    expect(await listing()).toEqual(STAGED);

    expect(valueOf(await store.load())).toEqual(SESSION);
    expect(await listing()).toEqual(STAGED);

    expect(valueOf(await store.accept())).toBe(join(project, 'keyframes.md'));
    expect(await listing()).toEqual([...STAGED, 'keyframes.md'].toSorted());
  });
});

describe('the answers log', () => {
  test('the first append creates .storyboard/<slug>/ and the log in it', async () => {
    valueOf(await store.append(SESSION[0] as Entry));
    expect(await listing()).toEqual([...SESSION_DIR, '.storyboard/inkwell/answers.jsonl']);
    expect(await read('.storyboard/inkwell/answers.jsonl')).toBe(valueOf(writeEntry(SESSION[0] as Entry)));
  });

  test('each append adds its line after the ones before, and leaves them byte for byte', async () => {
    // A first line the store would never write itself, its fields out of their usual order, so a
    // log rewritten from its entries would change it.
    const [first, ...rest] = SESSION as [Entry, ...Entry[]];
    const { kind, call, at, ...fields } = first;
    const hand = `${JSON.stringify({ at, ...fields, call, kind })}\n`;
    valueOf(await store.append(first));
    await writeFile(join(project, '.storyboard/inkwell/answers.jsonl'), hand);

    let before = hand;
    for (const entry of rest) {
      valueOf(await store.append(entry));
      const after = await read('.storyboard/inkwell/answers.jsonl');
      expect(after).toBe(`${before}${valueOf(writeEntry(entry))}`);
      before = after;
    }
    expect(valueOf(await store.load())).toEqual(SESSION);
  });

  test('loading gives back the same log, each line as the entry that wrote it', async () => {
    for (const entry of SESSION) {
      valueOf(await store.append(entry));
    }
    expect(valueOf(await store.load())).toEqual(SESSION);
    expect(await read('.storyboard/inkwell/answers.jsonl')).toBe(SESSION.map((entry) => valueOf(writeEntry(entry))).join(''));
    expect(valueOf(await valueOf(openStore(project, 'inkwell')).load())).toEqual(SESSION);
  });

  test('a malformed entry is refused, and nothing is written', async () => {
    const appended = await store.append({ kind: 'done', call: 0, at: AT });
    expect(appended).toEqual({ ok: false, problem: '"call" isn\'t a whole number from 1' });
    expect(await listing()).toEqual([]);
  });

  test('a malformed line is refused with its line number', async () => {
    valueOf(await store.append(SESSION[0] as Entry));
    await writeFile(join(project, '.storyboard/inkwell/answers.jsonl'), '{"kind":"done"}\n', { flag: 'a' });
    expect(await store.load()).toEqual({ ok: false, line: 2, problem: 'the entry has no "call"' });
  });

  test('sessions with different slugs keep their own logs', async () => {
    const other = valueOf(openStore(project, 'quill'));
    valueOf(await store.append(SESSION[0] as Entry));
    expect(valueOf(await other.load())).toEqual([]);
    expect(await listing()).toEqual([...SESSION_DIR, '.storyboard/inkwell/answers.jsonl']);
  });
});

describe('brief.md', () => {
  test('is rendered from the brief, over the one before', async () => {
    valueOf(await store.render(briefOf([])));
    expect(await read('.storyboard/inkwell/brief.md')).toBe(renderBrief(briefOf([])));
    valueOf(await store.render(briefOf(SESSION)));
    expect(await read('.storyboard/inkwell/brief.md')).toBe(renderBrief(briefOf(SESSION)));
    expect(await listing()).toEqual([...SESSION_DIR, '.storyboard/inkwell/brief.md']);
  });
});

describe('the staged draft (D3 (staged-draft))', () => {
  test('is written to draft/keyframes.md, over the one before, and its folder is given', async () => {
    expect(store.staged).toBe(join(project, '.storyboard/inkwell/draft'));
    expect(await listing()).toEqual([]);
    const dir = valueOf(await store.stage('# first\n'));
    expect(dir).toBe(store.staged);
    valueOf(await store.stage(DRAFT));
    expect(await read('.storyboard/inkwell/draft/keyframes.md')).toBe(DRAFT);
    expect(await listing()).toEqual([...SESSION_DIR, '.storyboard/inkwell/draft', '.storyboard/inkwell/draft/keyframes.md']);
  });
});

describe('accepting (C4 (write-on-accept))', () => {
  test("copies the staged draft to the project's keyframes.md, and leaves the staged one", async () => {
    valueOf(await store.stage(DRAFT));
    expect(valueOf(await store.accept())).toBe(join(project, 'keyframes.md'));
    expect(await read('keyframes.md')).toBe(DRAFT);
    expect(await read('.storyboard/inkwell/draft/keyframes.md')).toBe(DRAFT);
  });

  test('is refused when a keyframes.md is already there, which is left as it was', async () => {
    await writeFile(join(project, 'keyframes.md'), '# mine\n');
    valueOf(await store.stage(DRAFT));
    expect(await store.accept()).toEqual({
      ok: false,
      problem: `there's already a keyframes.md at ${join(project, 'keyframes.md')}, and accepting never writes over one`,
    });
    expect(await read('keyframes.md')).toBe('# mine\n');
  });

  test('is refused a second time, since the first accept put keyframes.md there', async () => {
    valueOf(await store.stage(DRAFT));
    valueOf(await store.accept());
    valueOf(await store.stage('# changed\n'));
    expect(await store.accept()).toMatchObject({ ok: false });
    expect(await read('keyframes.md')).toBe(DRAFT);
  });

  test('is refused with no draft staged, and writes nothing', async () => {
    expect(await store.accept()).toEqual({ ok: false, problem: 'no draft is staged to accept' });
    expect(await listing()).toEqual([]);
  });
});

describe('what the store refuses before it writes', () => {
  test('a project folder that is not there, so nothing is created in its place', async () => {
    const missing = join(project, 'missing');
    const lost = valueOf(openStore(missing, 'inkwell'));
    const refused = { ok: false, problem: `the project folder ${missing} isn't there` };
    expect(await lost.append(SESSION[0] as Entry)).toEqual(refused);
    expect(await lost.render(briefOf([]))).toEqual(refused);
    expect(await lost.stage(DRAFT)).toEqual(refused);
    expect(valueOf(await lost.load())).toEqual([]);
    expect(await listing()).toEqual([]);
  });

  test('a project path that is a file', async () => {
    await writeFile(join(project, 'file'), '');
    const refused = await valueOf(openStore(join(project, 'file'), 'inkwell')).append(SESSION[0] as Entry);
    expect(refused).toMatchObject({ ok: false });
    expect(await listing()).toEqual(['file']);
  });

  test.each(['', '.', '..', '../escape', 'a/b', 'a\\b', 'nul\0'])('the slug %j, which is not one plain name', (slug) => {
    expect(openStore(project, slug)).toEqual({
      ok: false,
      problem: `the slug ${JSON.stringify(slug)} can't name a session: it must be one name, with no slashes`,
    });
  });
});
