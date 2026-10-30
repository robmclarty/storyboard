import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GenerateOptions } from 'fascicle';
import { make_stub_engine, text_of } from 'fascicle/testing';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readSlot, replay, type Brief, type Entry, type Read, type Slot } from '../brief/index.js';
import { draftPlan } from '../draft.js';
import type { Lens } from '../lens.js';
import { modelsOn } from '../models/index.js';
import { CAPS, schedule } from '../scheduler.js';
import { openStore, type Store } from '../store.js';

// The draft step on fascicle's stub engine through the real models edge, a real store in a temp
// directory and the real `keyframes check`: what the model is given, and what it isn't trusted with.

const AT = '2026-10-29T12:00:00.000Z';

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

const SLOTS: readonly Slot[] = [
  valueOf(readSlot('frame', { id: 'problem', holds: 'The problem it solves', impact: '3', lands: 'Intent' })),
  valueOf(readSlot('intent', { id: 'taste', holds: 'How it should feel', impact: '2', lands: 'Taste' })),
];

const LENSES: readonly Lens[] = [
  { name: 'frame', slots: [SLOTS[0]!], clear: new Map([['problem', 'Who has it, and why today falls short.']]), questions: [], rubric: '# Frame: rubric' },
  { name: 'intent', slots: [SLOTS[1]!], clear: new Map([['taste', 'Words someone could act on.']]), questions: [], rubric: '# Intent: rubric' },
];

/** The problem Clear, and taste asked about with a recommended answer but left Partial. */
const ENTRIES: readonly Entry[] = [
  { kind: 'asked', call: 1, at: AT, questions: [{ id: 'taste-1', slots: ['taste'], text: 'How should it feel?', options: [], recommended: 'Quiet, like paper.' }] },
  {
    kind: 'answered',
    call: 2,
    at: AT,
    answers: [{ question: 'taste-1', text: 'Calm, I guess.' }],
    updates: [
      { slot: 'problem', status: 'clear', value: ['Notes get lost between devices.'] },
      { slot: 'taste', status: 'partial', value: ['Calm.'] },
    ],
  },
];

const BRIEF: Brief = valueOf(replay(SLOTS, ENTRIES));

/** The draft the brief is due, as the scheduler gives it: taste open, with its recommended default. */
const due = (): Extract<Parameters<typeof draftPlan>[2], { kind: 'draft' }> => {
  const next = schedule(BRIEF, { done: true, caps: CAPS });
  if (next.kind !== 'draft') {
    throw new Error('expected the draft');
  }
  return { kind: 'draft', open: next.open, previous: null, corrections: [] };
};

let project = '';
let store: Store;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'storyboard-draft-'));
  store = valueOf(openStore(project, 'notes'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

/** The models edge on a stub engine whose draft answers with `reply`, and the prompts it was sent. */
const drafting = (reply: unknown) => {
  const prompts: string[] = [];
  const engine = make_stub_engine([
    {
      prefix: 'storyboard/draft\n',
      content: (opts: GenerateOptions) => {
        prompts.push(text_of(opts));
        return reply;
      },
    },
  ]);
  return { models: modelsOn(engine, { local: 'qwen-test:1b', frontier: 'claude-test-1' }), prompts };
};

describe('draftPlan', () => {
  test("puts the brief's recommended default beside an open question, never one the model wrote", async () => {
    const { models } = drafting({
      intent: 'Notes get lost between devices.',
      items: [],
      open: [{ slot: 'taste', slug: 'feel', text: 'How should it feel, beyond calm?' }],
    });
    const event = valueOf(await draftPlan({ models, store, name: 'notes', lenses: LENSES }, BRIEF, due()));
    const staged = await readFile(join(store.staged, 'keyframes.md'), 'utf8');
    expect(staged).toContain('- **Q1 (feel)**: How should it feel, beyond calm? Lean: Quiet, like paper.');
    expect(event.kind === 'drafted' && event.chunks.join('\n')).toContain('Lean: Quiet, like paper.');
  });

  test("gives the model every slot with where it lands and what makes it Clear, and both lenses' rubrics", async () => {
    const { models, prompts } = drafting({ intent: 'Notes.', items: [], open: [{ slot: 'taste', slug: 'feel', text: 'How should it feel?' }] });
    valueOf(await draftPlan({ models, store, name: 'notes', lenses: LENSES }, BRIEF, due()));
    expect(prompts[0]).toContain('# Frame: rubric\n\n# Intent: rubric');
    expect(prompts[0]).toContain('"clear when": "Words someone could act on."');
    expect(prompts[0]).toContain('"lands in": "taste"');
    expect(prompts[0]).toContain('The open slots, each to get one question: taste.');
  });

  test('passes a refusal from the model on, and stages nothing', async () => {
    const { models } = drafting({ intent: 'Notes.', items: [], open: [] });
    const read = await draftPlan({ models, store, name: 'notes', lenses: LENSES }, BRIEF, due());
    expect(read.ok ? '' : read.problem).toContain('the open slot "taste" has no question');
    await expect(readFile(join(store.staged, 'keyframes.md'), 'utf8')).rejects.toThrow();
  });
});
