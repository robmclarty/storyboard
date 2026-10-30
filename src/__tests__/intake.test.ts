import type { GenerateOptions } from 'fascicle';
import { make_stub_engine, text_of } from 'fascicle/testing';
import { describe, expect, test } from 'vitest';

import type { Entry, Read } from '../brief/index.js';
import { classifyIntake, intakeQuestions } from '../intake.js';
import { LENSES, loadLenses } from '../lens.js';
import { modelsOn, type Models } from '../models/index.js';

const AT = '2026-10-29T12:00:00.000Z';

/** The value a read gave, failing the test on a refusal. */
const valueOf = <T>(read: Read<T>): T => {
  if (!read.ok) {
    throw new Error(read.problem);
  }
  return read.value;
};

/** Intake asked, answered in two calls, then a later round asked and answered. */
const ENTRIES: readonly Entry[] = [
  {
    kind: 'asked',
    call: 1,
    at: AT,
    questions: [
      { id: 'intake-1', slots: ['problem', 'audience'], text: "What is it, and who's it for?", options: [], recommended: null },
      { id: 'intake-3', slots: ['no-gos'], text: 'What must it never do?', options: [], recommended: null },
    ],
  },
  { kind: 'answered', call: 2, at: AT, answers: [{ question: 'intake-1', text: 'A notes app, for me.' }], updates: [] },
  { kind: 'answered', call: 2, at: AT, answers: [{ question: 'intake-3', text: 'Never phone home.' }], updates: [] },
  {
    kind: 'asked',
    call: 3,
    at: AT,
    questions: [{ id: 'taste-3', slots: ['taste'], text: 'How should it feel?', options: [], recommended: 'Quiet.' }],
  },
  { kind: 'answered', call: 4, at: AT, answers: [{ question: 'taste-3', text: 'Like paper.' }], updates: [] },
];

/** The models edge on fascicle's stub engine, its classify answering with `reply`, and the prompts it was sent. */
const classifying = (reply: unknown): { readonly models: Models; readonly prompts: string[] } => {
  const prompts: string[] = [];
  const engine = make_stub_engine([
    {
      prefix: 'storyboard/classify\n',
      content: (opts: GenerateOptions) => {
        prompts.push(text_of(opts));
        return reply;
      },
    },
  ]);
  return { models: modelsOn(engine, { local: 'qwen-test:1b', frontier: 'claude-test-1' }), prompts };
};

describe('intakeQuestions', () => {
  test("gives the frame lens's three intake questions, open and recommending nothing", async () => {
    const [frame] = valueOf(await loadLenses(LENSES, ['frame']));
    expect(frame === undefined ? [] : intakeQuestions(frame)).toEqual([
      { id: 'intake-1', slots: ['problem', 'audience'], text: "What is it, and who's it for?", options: [], recommended: null },
      { id: 'intake-2', slots: ['done', 'appetite'], text: 'What would make it a success, and how much time is it worth?', options: [], recommended: null },
      { id: 'intake-3', slots: ['no-gos'], text: 'What must it never do?', options: [], recommended: null },
    ]);
  });
});

describe('classifyIntake', () => {
  test("sends intake's questions and answers, and no later ones, to classify", async () => {
    const { models, prompts } = classifying({ work: 'library', size: 'small' });
    expect(valueOf(await classifyIntake(models, ENTRIES))).toEqual({ kind: 'classified', work: 'library', size: 'small' });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('"answer": "A notes app, for me."');
    expect(prompts[0]).toContain('"answer": "Never phone home."');
    expect(prompts[0]).not.toContain('Like paper.');
  });

  test("passes the model's refusal on", async () => {
    const { models } = classifying({ work: 'library', size: 'enormous' });
    const read = await classifyIntake(models, ENTRIES);
    expect(read.ok ? '' : read.problem).toContain("classify, on the local model qwen-test:1b: its reply didn't fit its schema: size");
  });
});
