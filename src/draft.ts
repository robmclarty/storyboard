import type { Brief, Read } from './brief/index.js';
import { cutPlayback, emitKeyframes, type Draft } from './emit/index.js';
import { check, type Verdict } from './keyframes.js';
import type { Lens } from './lens.js';
import type { Drafted, Drafting, Models } from './models/index.js';
import type { Store } from './store.js';
import type { Event, Next } from './turn.js';

// Drafting: the frontier model writes the plan as data, the core's emitter writes the file, the
// store stages it, and `keyframes check --strict` reads it there (D2 (draft-as-data), D3
// (staged-draft)). A draft that fails goes back to the model once with the findings, and whatever
// still fails is played back as a chunk of its own, never hidden (D4 (clean-to-accept)). Accepting
// checks the staged draft again and copies it only when it's clean (C4 (write-on-accept)).

/** What a draft is drafted for. */
type Due = Extract<Next, { kind: 'draft' }>;

/** What drafting needs: the models, the session's store, the plan's name and the lenses. */
export type Drafter = {
  readonly models: Models;
  readonly store: Store;
  /** The plan's name, its title in `keyframes.md`. */
  readonly name: string;
  readonly lenses: readonly Lens[];
};

/** The heading of the chunk that plays back what `keyframes check` found. */
const FOUND = '## What keyframes check found';

/** The question every playback chunk ends with, as the cutter writes it. */
const ENDING = /\n*What's wrong or missing\?\s*$/;

/** The draft a playback came from, as text: its chunks without their question, and without what the check found. */
const textOf = (chunks: readonly string[]): string =>
  chunks
    .filter((chunk) => !chunk.startsWith(FOUND))
    .map((chunk) => chunk.replace(ENDING, ''))
    .join('\n\n');

/** What the model is given: the brief with what makes each slot Clear, the open slots, the rubrics, and the draft before. */
const draftingOf = ({ lenses }: Drafter, brief: Brief, due: Due): Drafting => {
  const clear = new Map(lenses.flatMap((lens) => [...lens.clear]));
  return {
    work: brief.work,
    size: brief.size,
    slots: brief.slots.map(({ slot, status, value }) => ({ id: slot.id, holds: slot.holds, clear: clear.get(slot.id) ?? '', status, value, lands: slot.lands })),
    open: due.open.map((open) => open.slot.id),
    rubric: lenses.map((lens) => lens.rubric).join('\n\n'),
    previous: due.previous === null ? null : textOf(due.previous),
    corrections: due.corrections.map(({ chunk, text, items }) => ({ chunk: due.previous?.[chunk] ?? '', text, items })),
    findings: [],
  };
};

/** The emitter's draft from the model's, each open question's lean the latest default the brief holds for its slot (C5 (open-not-guessed)). */
const draftOf = (name: string, drafted: Drafted, due: Due): Draft => ({
  name,
  intent: drafted.intent,
  items: drafted.items,
  open: drafted.open.map(({ slot, slug, text }) => ({ slug, text, lean: due.open.find((open) => open.slot.id === slot)?.recommended ?? null })),
});

/** One draft: drafted, emitted, staged and checked. */
const once = async (drafter: Drafter, drafting: Drafting, due: Due): Promise<Read<{ readonly text: string; readonly verdict: Verdict }>> => {
  const drafted = await drafter.models.draft(drafting);
  if (!drafted.ok) {
    return drafted;
  }
  const text = emitKeyframes(draftOf(drafter.name, drafted.value, due));
  if (!text.ok) {
    return { ok: false, problem: `the draft didn't emit: ${text.problem}` };
  }
  const dir = await drafter.store.stage(text.value);
  return dir.ok ? { ok: true, value: { text: text.value, verdict: await check(dir.value) } } : dir;
};

/** Whether a verdict lets the draft be accepted: checked, with no error and, under `--strict`, no warning. */
const clean = (verdict: Verdict): boolean => verdict.kind === 'checked' && verdict.exit === 0;

/** A count and its noun, such as "1 error" or "2 warnings". */
const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Each error and warning a check found, a line each. Notes don't fail a check, so they're left out. */
const findingLines = ({ findings }: Extract<Verdict, { kind: 'checked' }>): readonly string[] =>
  findings
    .filter((finding) => finding.severity !== 'note')
    .map(({ line, severity, code, message }) => `- Line ${line}, ${severity} (${code}): ${message}`);

/** What a check found, as one line: "found 1 error and 0 warnings", or that it reached no verdict and why. */
const foundOf = (verdict: Verdict): string =>
  verdict.kind === 'no-verdict'
    ? `keyframes check reached no verdict on it: ${verdict.problem}`
    : `keyframes check found ${counted(verdict.errors, 'error')} and ${counted(verdict.warnings, 'warning')} in it`;

/** What a verdict that isn't clean found, as the lines a person reads in the playback. */
const foundLines = (verdict: Verdict): readonly string[] =>
  verdict.kind === 'no-verdict'
    ? [`This draft can't be accepted: ${foundOf(verdict)}.`]
    : [`This draft can't be accepted until each of these is settled: ${foundOf(verdict)}.`, '', ...findingLines(verdict)];

/** The chunks that play back what the check found, or none for a clean draft. */
const foundChunks = (verdict: Verdict): readonly string[] =>
  clean(verdict) ? [] : cutPlayback([FOUND, '', ...foundLines(verdict)].join('\n'));

/**
 * Drafts the plan for the session as it stands, and gives the event the core takes: the draft cut
 * into playback chunks, with what the check found after them when it isn't clean. A draft that
 * fails its check goes back to the model once, given the failing draft and the findings.
 */
export const draftPlan = async (drafter: Drafter, brief: Brief, due: Due): Promise<Read<Event>> => {
  const drafting = draftingOf(drafter, brief, due);
  const first = await once(drafter, drafting, due);
  if (!first.ok) {
    return first;
  }
  const { text, verdict } = first.value;
  const final =
    verdict.kind === 'checked' && verdict.exit === 1 ? await once(drafter, { ...drafting, previous: text, findings: verdict.findings }, due) : first;
  if (!final.ok) {
    return final;
  }
  return { ok: true, value: { kind: 'drafted', chunks: [...cutPlayback(final.value.text), ...foundChunks(final.value.verdict)] } };
};

/**
 * Accepts the staged draft: checks it again and copies it to the project's `keyframes.md` only when
 * the check is clean, giving the path it's at. A refusal says why: what the check found, or that a
 * `keyframes.md` is already there.
 */
export const acceptPlan = async (store: Store): Promise<Read<string>> => {
  const verdict = await check(store.staged);
  if (clean(verdict)) {
    return store.accept();
  }
  const findings = verdict.kind === 'checked' ? findingLines(verdict) : [];
  return { ok: false, problem: [`the draft can't be accepted: ${foundOf(verdict)}`, ...findings].join('\n') };
};
