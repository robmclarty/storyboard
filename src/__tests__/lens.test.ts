import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Read } from '../brief/index.js';
import { emitKeyframes, type Draft } from '../emit/index.js';
import { LENSES, loadLenses, readLens, type Lens } from '../lens.js';

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(`${read.problem}${read.line === undefined ? '' : ` (line ${read.line})`}`);
  }
  return read.value;
};

describe('the real lenses/ folder', () => {
  let lenses: readonly Lens[] = [];

  beforeAll(async () => {
    lenses = valueOf(await loadLenses(LENSES, ['frame', 'intent']));
  });

  /** A lens by its name. */
  const lens = (name: string): Lens => {
    const found = lenses.find((each) => each.name === name);
    if (found === undefined) {
      throw new Error(`no lens "${name}"`);
    }
    return found;
  };

  test('loads frame, then intent', () => {
    expect(lenses.map((each) => each.name)).toEqual(['frame', 'intent']);
  });

  test("frame's slots draft the Intent, and its no-gos draft Constraints", () => {
    expect(lens('frame').slots.map((slot) => [slot.id, slot.lands])).toEqual([
      ['problem', 'intent'],
      ['audience', 'intent'],
      ['appetite', 'intent'],
      ['no-gos', 'constraints'],
      ['done', 'intent'],
      ['prior-art', 'intent'],
    ]);
  });

  test("intent's slots draft one each of keyframes' P, C, D, T, Q and I sections", () => {
    expect(lens('intent').slots.map((slot) => slot.lands)).toEqual(['principles', 'constraints', 'decisions', 'taste', 'questions', 'ideas']);
  });

  test('every slot lands in a section the emitter writes', () => {
    const slots = lenses.flatMap((each) => each.slots);
    const draft: Draft = {
      name: 'every slot',
      intent: 'One paragraph of Intent.',
      items: slots.flatMap(({ id, holds, lands }) => (lands === 'intent' ? [] : [{ section: lands, slug: id, text: holds, because: 'it was asked.' }])),
      open: [],
    };
    const emitted = valueOf(emitKeyframes(draft));
    for (const slot of slots) {
      expect(emitted, slot.id).toContain(`\n## ${slot.lands.charAt(0).toUpperCase()}${slot.lands.slice(1)}\n`);
    }
  });

  test('every slot says what makes it Clear', () => {
    for (const each of lenses) {
      expect([...each.clear.keys()]).toEqual(each.slots.map((slot) => slot.id));
      for (const text of each.clear.values()) {
        expect(text.length).toBeGreaterThan(40);
      }
    }
  });

  test("frame opens with intake's three questions, open and recommending nothing, as the sketch asks them", () => {
    const intake = lens('frame').questions.slice(0, 3);
    expect(intake.map(({ kind, text, options, recommended }) => ({ kind, text, options, recommended }))).toEqual([
      { kind: 'intake', text: "What is it, and who's it for?", options: [], recommended: null },
      { kind: 'intake', text: 'What would make it a success, and how much time is it worth?', options: [], recommended: null },
      { kind: 'intake', text: 'What must it never do?', options: [], recommended: null },
    ]);
    expect(lens('frame').questions.slice(3).every((question) => question.kind !== 'intake')).toBe(true);
    expect(lens('intent').questions.some((question) => question.kind === 'intake')).toBe(false);
  });

  test('every question names only slots of its own lens', () => {
    for (const each of lenses) {
      const owned = new Set(each.slots.map((slot) => slot.id));
      for (const question of each.questions) {
        expect(question.slots.every((slot) => owned.has(slot)), question.id).toBe(true);
      }
    }
  });

  test("every question after intake's recommends an answer, and every menu recommends one of its two to four options", () => {
    const after = lenses.flatMap((each) => each.questions).filter((question) => question.kind !== 'intake');
    for (const { id, kind, options, recommended } of after) {
      expect(recommended, id).not.toBeNull();
      if (kind === 'menu') {
        expect(options.length, id).toBeGreaterThanOrEqual(2);
        expect(options.length, id).toBeLessThanOrEqual(4);
        expect(options, id).toContain(recommended);
      } else {
        expect(options, id).toEqual([]);
      }
    }
  });

  test("every slot has a question after intake's", () => {
    for (const each of lenses) {
      for (const slot of each.slots) {
        expect(
          each.questions.some((question) => question.kind !== 'intake' && question.slots.includes(slot.id)),
          slot.id,
        ).toBe(true);
      }
    }
  });

  test('every lens has a rubric that names the defaults it steers away from', () => {
    for (const each of lenses) {
      expect(each.rubric).toContain('## Defaults to steer away from');
    }
  });
});

// A small lens, written the way the real ones are, that each refusal below breaks in one place.

const SKILL = `---
name: tiny
description: "A lens for tests."
---

# Tiny

## Slots

| Slot | Holds | Impact | Lands in |
| --- | --- | --- | --- |
| scope | What it covers | 3 | Intent |
| feel | How it should feel | 1 | Taste |

## When a slot is Clear

- **scope**: It says what's in and what's out.
- **feel**: It says how it should feel,
  with an example.
`;

const QUESTIONS = `# Tiny: questions

Prose between questions is skipped, and so is an example:

\`\`\`markdown
- **not-a-question**: This is an example.
\`\`\`

- **intake-1**: What is it?
  - kind: intake
  - slots: scope
- **scope-size**: How big is it,
  all told?
  - kind: menu
  - slots: scope
  - option: Small
  - option: Large
  - recommended: Small
- **feel-how**: How should it feel?
  - kind: open
  - slots: feel, scope
  - recommended: Quiet, and out
    of the way.
`;

const RUBRIC = '# Tiny: rubric\n\nA good draft is short.\n';

const FILES = { skill: SKILL, questions: QUESTIONS, rubric: RUBRIC };

/** An intake question about the tiny lens's scope. */
const intake = (n: number): string => `- **intake-${n}**: Question ${n}?\n  - kind: intake\n  - slots: scope\n`;

/** The tiny lens renamed, with its slots and questions renamed too, so it can sit beside the first. */
const renamed = (name: string, ids: Readonly<Record<string, string>>): typeof FILES => {
  const swap = (text: string): string => Object.entries({ tiny: name, ...ids }).reduce((each, [from, to]) => each.replaceAll(from, to), text);
  return { skill: swap(SKILL), questions: swap(QUESTIONS), rubric: RUBRIC };
};

describe('readLens', () => {
  test('reads the slots, what makes each Clear, the questions in order and the rubric', () => {
    const lens = valueOf(readLens('tiny', FILES));
    expect(lens.slots).toEqual([
      { id: 'scope', lens: 'tiny', holds: 'What it covers', impact: 3, lands: 'intent' },
      { id: 'feel', lens: 'tiny', holds: 'How it should feel', impact: 1, lands: 'taste' },
    ]);
    expect(lens.clear).toEqual(
      new Map([
        ['scope', "It says what's in and what's out."],
        ['feel', 'It says how it should feel, with an example.'],
      ]),
    );
    expect(lens.questions).toEqual([
      { id: 'intake-1', kind: 'intake', slots: ['scope'], text: 'What is it?', options: [], recommended: null },
      { id: 'scope-size', kind: 'menu', slots: ['scope'], text: 'How big is it, all told?', options: ['Small', 'Large'], recommended: 'Small' },
      { id: 'feel-how', kind: 'open', slots: ['feel', 'scope'], text: 'How should it feel?', options: [], recommended: 'Quiet, and out of the way.' },
    ]);
    expect(lens.rubric).toBe('# Tiny: rubric\n\nA good draft is short.');
  });

  /** The files with `from` replaced by `to` in one of them, which must hold it. */
  const breaking = (file: keyof typeof FILES, from: string, to: string): typeof FILES => {
    expect(FILES[file]).toContain(from);
    return { ...FILES, [file]: FILES[file].replace(from, to) };
  };

  test.each<readonly [string, keyof typeof FILES, string, string, number | undefined, string]>([
    ['no frontmatter', 'skill', '---\nname: tiny', 'name: tiny', 1, "tiny/SKILL.md: it doesn't open with frontmatter"],
    ['frontmatter that never closes', 'skill', '"A lens for tests."\n---', '"A lens for tests."', 1, 'never closes'],
    ['a frontmatter naming another lens', 'skill', 'name: tiny', 'name: small', 1, 'names the lens "small", and its folder is "tiny"'],
    ['a frontmatter with no description', 'skill', 'description: "A lens for tests."', 'description: ""', 1, 'has no description'],
    ['no Slots section', 'skill', '## Slots', '## Slot', undefined, 'it has no "## Slots" section'],
    ['a Slots table with another header', 'skill', '| Lands in |', '| Section |', 10, "the Slots table's header isn't"],
    ['a Slots table with no rule under its header', 'skill', '| --- | --- | --- | --- |\n', '', 11, 'no `| --- |` line'],
    ['a Slots table with no slots', 'skill', '| scope | What it covers | 3 | Intent |\n| feel | How it should feel | 1 | Taste |\n', '', 11, 'has no slots'],
    ['a row with too few cells', 'skill', '| 1 | Taste |', '| Taste |', 13, 'has 3 cells, and it needs 4'],
    ['a slot the core refuses', 'skill', '| 3 | Intent |', '| 4 | Intent |', 12, 'has impact "4"'],
    ['a slot twice', 'skill', '| feel | How', '| scope | How', undefined, 'has the slot "scope" twice'],
    ['no Clear section', 'skill', '## When a slot is Clear', '## Clear', undefined, 'no "## When a slot is Clear" section'],
    ['a slot with no Clear line', 'skill', "- **scope**: It says what's in and what's out.\n", '', 15, `doesn't say when "scope" is Clear`],
    ['a Clear line for a slot the lens lacks', 'skill', '- **feel**: It says', '- **look**: It says', 18, 'the lens has no slot "look"'],
    ['a Clear line twice', 'skill', '- **feel**: It says', '- **scope**: It says', 18, 'when "scope" is Clear twice'],
    ['a Clear line with a sub-line', 'skill', '  with an example.', '  - because: it was asked.', 18, 'with no sub-lines'],
    ['a bold bullet that does not read', 'questions', '- **feel-how**: How', '- **feel-how** How', 19, "a bullet that opens in bold isn't"],
    ['a nested bullet that is not a key', 'questions', '  - option: Large', '  - Large', 17, `a line under "scope-size" isn't`],
    ['an id that is not a slug', 'questions', '**feel-how**', '**Feel How**', 19, 'the question "Feel How" isn\'t named as a slug'],
    ['a question with no text', 'questions', '- **intake-1**: What is it?', '- **intake-1**:', 9, 'the question "intake-1" has no text'],
    ['an unknown key', 'questions', '  - recommended: Quiet', '  - lean: Quiet', 22, 'has a key it shouldn\'t: "lean"'],
    ['a key twice', 'questions', '  - kind: open\n', '  - kind: open\n  - kind: open\n', 21, 'has "kind" twice'],
    ['no kind', 'questions', '  - kind: menu\n', '', 12, 'the question "scope-size" has no kind'],
    ['an unknown kind', 'questions', 'kind: open', 'kind: free', 20, 'is of the kind "free", and a kind is intake, open or menu'],
    ['no slots', 'questions', '  - slots: feel, scope\n', '', 19, 'the question "feel-how" names no slots'],
    ['a slot of another lens', 'questions', 'slots: feel, scope', 'slots: feel, problem', 21, 'and the tiny lens has no slot "problem"'],
    ['a slot named twice', 'questions', 'slots: feel, scope', 'slots: feel, feel', 21, 'names the slot "feel" twice'],
    ['an intake question with options', 'questions', '  - slots: scope\n- **scope-size**', '  - slots: scope\n  - option: A\n  - option: B\n- **scope-size**', 9, "is one of intake's, which are open, and it has options"],
    ['an intake question that recommends', 'questions', '  - slots: scope\n- **scope-size**', '  - slots: scope\n  - recommended: A\n- **scope-size**', 9, 'which recommend nothing'],
    ['a follow-up that recommends nothing', 'questions', '  - recommended: Small\n', '', 12, "recommends no answer, and every question after intake's needs one"],
    ['an open question with options', 'questions', '  - recommended: Quiet', '  - option: A\n  - recommended: Quiet', 19, 'is open, and it has 1 options'],
    ['a menu of one option', 'questions', '  - option: Large\n', '', 12, 'is a menu of 1 options, and a menu has two to four'],
    ['a menu that recommends something else', 'questions', 'recommended: Small', 'recommended: Medium', 12, 'recommends "Medium", which isn\'t one of its options'],
    ['a question twice', 'questions', '**feel-how**', '**scope-size**', 19, 'the question "scope-size" is in the bank twice'],
    [
      'intake after a follow-up',
      'questions',
      '  - kind: open\n  - slots: feel, scope\n  - recommended: Quiet, and out\n    of the way.\n',
      '  - kind: intake\n  - slots: feel, scope\n',
      19,
      '"feel-how" comes after a follow-up',
    ],
    ['a slot no follow-up asks about', 'questions', 'slots: feel, scope', 'slots: scope', undefined, 'no question after intake\'s asks about the slot "feel"'],
    ['an empty rubric', 'rubric', RUBRIC, '\n  \n', undefined, "tiny/rubric.md: it's empty"],
  ])('refuses %s', (_name, file, from, to, line, problem) => {
    const read = readLens('tiny', breaking(file, from, to));
    expect(read.ok).toBe(false);
    expect(!read.ok && read.problem).toContain(problem);
    expect(!read.ok && read.problem.startsWith(`tiny/${file === 'skill' ? 'SKILL' : file}.md: `)).toBe(true);
    expect(!read.ok && read.line).toBe(line);
  });

  test('refuses more than three intake questions', () => {
    const questions = `${[2, 3, 4].map(intake).join('')}${QUESTIONS}`;
    expect(readLens('tiny', { ...FILES, questions })).toEqual({
      ok: false,
      problem: 'tiny/questions.md: intake asks 3 questions at most, and the bank has 4',
    });
  });
});

describe('loadLenses', () => {
  let root = '';

  /** Writes a lens's files into the temp root under `name`, leaving out any given as null. */
  const write = async (name: string, files: { readonly skill: string | null; readonly questions: string | null; readonly rubric: string | null }): Promise<void> => {
    await mkdir(join(root, name), { recursive: true });
    const written = [
      ['SKILL.md', files.skill],
      ['questions.md', files.questions],
      ['rubric.md', files.rubric],
    ] as const;
    await Promise.all(written.flatMap(([file, text]) => (text === null ? [] : [writeFile(join(root, name, file), text)])));
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'storyboard-lenses-'));
    await write('tiny', FILES);
    await write('second', renamed('second', { scope: 'reach', feel: 'tone', 'intake-1': 'second-1', 'scope-size': 'reach-size', 'feel-how': 'tone-how', 'kind: intake': 'kind: open\n  - recommended: Yes' }));
    await write('clash', renamed('clash', { feel: 'tone', 'intake-1': 'clash-1', 'scope-size': 'clash-size', 'feel-how': 'tone-how', 'kind: intake': 'kind: open\n  - recommended: Yes' }));
    await write('echo', {
      skill: renamed('echo', { scope: 'span', feel: 'mood' }).skill,
      questions: '- **scope-size**: How far does it reach?\n  - kind: open\n  - slots: span, mood\n  - recommended: Not far.\n',
      rubric: RUBRIC,
    });
    await write('partial', { skill: SKILL.replace('name: tiny', 'name: partial'), questions: null, rubric: RUBRIC });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('loads lenses in the order given', async () => {
    const lenses = valueOf(await loadLenses(root, ['tiny', 'second']));
    expect(lenses.map((lens) => [lens.name, lens.slots.map((slot) => slot.id)])).toEqual([
      ['tiny', ['scope', 'feel']],
      ['second', ['reach', 'tone']],
    ]);
  });

  test('refuses a lens with a file missing, naming it', async () => {
    expect(await loadLenses(root, ['partial'])).toEqual({ ok: false, problem: "partial/questions.md isn't there" });
    expect(await loadLenses(root, ['missing'])).toEqual({ ok: false, problem: "missing/SKILL.md isn't there" });
  });

  test("refuses a lens that doesn't read, as readLens does", async () => {
    const read = await loadLenses(root, ['tiny', 'partial']);
    expect(read).toEqual({ ok: false, problem: "partial/questions.md isn't there" });
  });

  test('refuses a slot in two lenses', async () => {
    expect(await loadLenses(root, ['tiny', 'clash'])).toEqual({ ok: false, problem: 'the slot "scope" is in both the tiny and clash lenses' });
  });

  test('refuses a question in two lenses', async () => {
    expect(await loadLenses(root, ['tiny', 'echo'])).toEqual({ ok: false, problem: 'the question "scope-size" is in both the tiny and echo lenses' });
  });

  test("refuses intake questions in any lens but the first", async () => {
    expect(await loadLenses(root, ['second', 'tiny'])).toEqual({ ok: false, problem: "intake's questions are the first lens's, and the tiny lens has some" });
  });
});
