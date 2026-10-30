import { join } from 'node:path';

import type { Brief, Question, Read, Stamp } from './brief/index.js';
import { acceptPlan, draftPlan } from './draft.js';
import { classifyIntake, intakeQuestions, NO_PLANNER } from './intake.js';
import { LENSES, loadLenses, type Lens } from './lens.js';
import type { Models, Said, SlotView } from './models/index.js';
import { openStore, type Store } from './store.js';
import { resume, turn, type Event, type Next, type Session } from './turn.js';

// One `storyboard turn` call (D10 (one-turn-command)). It loads the session from its files, takes
// what the person said, then carries out whatever comes next that a model can: intake's questions,
// the classification, the next round phrased, the draft. It stops where the person has to speak
// again. Answers are read by `interpret` into slot updates (D1 (interpreted-answers)); a reply to a
// chunk of the draft is a pass when it's blank, and otherwise a correction, logged as its own entry
// and read into the slots it touches (D19 (corrections-as-entries)). Each entry is appended as the
// core takes it, so every answer and its reading are on disk before the next model call can fail,
// and `brief.md` is rendered from the session at the end (D11 (log-is-truth)). Only an accept writes
// outside the session's folder (C4 (write-on-accept)). The models come in as an argument, so a test
// hands the flow a fake (D9 (models-injected)).

/** The lenses this goal asks with, in the order the scheduler breaks ties in (D6 (frame-and-intent)). */
const ORDER = ['frame', 'intent'];

/** What one call needs from outside: the models, and the clock. */
export type Deps = {
  readonly models: Models;
  /** The time, as the log stamps it. */
  readonly now: () => string;
};

/** What the person sent with one call. */
export type Request = {
  /** The folder of the project being planned. */
  readonly project: string;
  readonly slug: string;
  /**
   * What the person said, by the id of what they were shown: a question's, or the chunk's being
   * played back. A blank answer to a question is no answer, and a blank reply to a chunk passes it.
   */
  readonly answers: Readonly<Record<string, string>>;
  /** The person has said done: draft now. */
  readonly done: boolean;
  /** The person has accepted the draft: write `keyframes.md`. */
  readonly accept: boolean;
};

/** What the call shows the person once it stops. */
export type Shown =
  /** Questions waiting for answers, by id, all about one lens's slots. */
  | { readonly kind: 'questions'; readonly lens: string; readonly questions: readonly Question[] }
  /** A chunk of the draft, to pass or correct under `id`: the `place`-th of the draft's `of`. */
  | { readonly kind: 'chunk'; readonly id: string; readonly place: number; readonly of: number; readonly text: string }
  /** The playback is over with nothing corrected: accept, or correct the last chunk under `id`. */
  | { readonly kind: 'accept'; readonly id: string }
  /** The draft was accepted, and `keyframes.md` is at `path`. */
  | { readonly kind: 'accepted'; readonly path: string }
  /** The accept was refused, and why. Nothing was written. */
  | { readonly kind: 'refused'; readonly problem: string }
  /** The session is over: the work is too small to need a plan. */
  | { readonly kind: 'no-planner'; readonly message: string; readonly work: Brief['work']; readonly size: Brief['size'] };

/** What a call works with: the models, the session's store, the lenses, the request and the call's stamp. */
type Context = {
  readonly models: Models;
  readonly store: Store;
  readonly lenses: readonly Lens[];
  readonly request: Request;
  readonly stamp: Stamp;
};

/** Where a call got to, and what it shows, or why it stopped short. */
type Reached = { readonly session: Session; readonly result: Read<Shown> };

/** A refusal. */
const refused = <T>(problem: string): Read<T> => ({ ok: false, problem });

/** A refusal from a file, naming the line it's on when it has one. */
const fromFile = <T>(file: string, read: Read<unknown> & { readonly ok: false }): Read<T> =>
  refused(`${file}${read.line === undefined ? '' : `, line ${read.line}`}: ${read.problem}`);

/** Every slot of the brief as a model call sees it, with what makes it Clear. */
const viewsOf = (context: Context, brief: Brief): readonly SlotView[] => {
  const clear = new Map(context.lenses.flatMap((lens) => [...lens.clear]));
  return brief.slots.map(({ slot, status, value }) => ({ id: slot.id, holds: slot.holds, clear: clear.get(slot.id) ?? '', status, value }));
};

/** A question and the person's answer to it, as `interpret` reads them: a menu's options and recommendation included. */
const saidOf = (question: Question, answer: string): Said => {
  const options = question.options.length === 0 ? [] : [`Options: ${question.options.join('; ')}`];
  const recommended = question.recommended === null ? [] : [`Recommended: ${question.recommended}`];
  return { asked: [question.text, ...options, ...recommended].join('\n'), about: question.slots, answer };
};

/** The id a chunk of the draft is replied to under: its place in the draft, counting from 1. */
const chunkId = (chunk: number): string => `chunk-${chunk + 1}`;

/** The draft's items a correction names, such as `D3`, each once, in the order it names them. */
const itemsIn = (text: string): readonly string[] => [...new Set(text.match(/\b[PCDTQI][1-9]\d*\b/g) ?? [])];

/** Takes one event onto the session through the core, and appends the entry it adds. */
const take = async (context: Context, session: Session, event: Event): Promise<Read<Session>> => {
  const taken = turn(session, event, context.stamp);
  if (!taken.ok) {
    return taken;
  }
  const appended = await context.store.append(taken.value.entry);
  return appended.ok ? { ok: true, value: taken.value.session } : appended;
};

/** Reads the person's answers to the waiting round into slot updates, and takes them. */
const answer = async (
  context: Context,
  session: Session,
  questions: readonly Question[],
  answers: readonly (readonly [string, string])[],
): Promise<Read<Session>> => {
  const said: Said[] = [];
  for (const [id, text] of answers) {
    const question = questions.find((each) => each.id === id);
    if (question === undefined) {
      return refused(`the question "${id}" isn't waiting for an answer: the questions waiting are ${questions.map((each) => each.id).join(', ')}`);
    }
    said.push(saidOf(question, text));
  }
  const updates = await context.models.interpret({ slots: viewsOf(context, session.brief), said });
  if (!updates.ok) {
    return updates;
  }
  return take(context, session, { kind: 'answered', answers: answers.map(([question, text]) => ({ question, text })), updates: updates.value });
};

/** The chunk a reply to the playback is about: the one being played, or at the accept the last one played. */
const chunkNow = (session: Session): { readonly chunk: number; readonly text: string } | undefined => {
  const { next, phase } = session;
  if (next.kind === 'play') {
    return next;
  }
  const chunk = next.kind === 'accept' ? phase.draft?.play.at(-1) : undefined;
  return chunk === undefined ? undefined : { chunk, text: phase.draft?.chunks[chunk] ?? '' };
};

/** Takes the person's reply to a chunk: a pass when it's blank, and otherwise a correction, read into the slots it touches. */
const reply = async (context: Context, session: Session, answers: readonly (readonly [string, string])[]): Promise<Read<Session>> => {
  const now = chunkNow(session);
  const id = now === undefined ? '' : chunkId(now.chunk);
  const [only, ...more] = answers;
  if (now === undefined || only === undefined || only[0] !== id || more.length > 0) {
    return refused(`a reply to the playback goes under the id of the chunk being played, ${id}, and nothing else: this was ${answers.map(([key]) => key).join(', ')}`);
  }
  const text = only[1];
  if (text.trim() === '') {
    return session.next.kind === 'play' ? take(context, session, { kind: 'passed' }) : { ok: true, value: session };
  }
  const updates = await context.models.interpret({ slots: viewsOf(context, session.brief), said: [{ asked: now.text, about: [], answer: text }] });
  if (!updates.ok) {
    return updates;
  }
  return take(context, session, { kind: 'corrected', text, items: itemsIn(text), updates: updates.value });
};

/** Takes what the person said: answers to the waiting round, or a reply to the playback. */
const hear = async (context: Context, session: Session): Promise<Read<Session>> => {
  const { next } = session;
  const answers = Object.entries(context.request.answers);
  if (next.kind === 'play' || next.kind === 'accept') {
    return answers.length === 0 ? { ok: true, value: session } : reply(context, session, answers);
  }
  const given = answers.filter(([, text]) => text.trim() !== '');
  if (given.length === 0) {
    return { ok: true, value: session };
  }
  if (next.kind !== 'answer') {
    return refused(`no questions are waiting for answers, so these can't be taken: ${given.map(([id]) => id).join(', ')}`);
  }
  return answer(context, session, next.questions, given);
};

/** Phrases the scheduler's round from its lens's bank, each question's id its first slot and the call. */
const phrase = async (context: Context, session: Session, next: Extract<Next, { kind: 'ask' }>): Promise<Read<Event>> => {
  const lens = context.lenses.find((each) => each.name === next.lens);
  const bank = (lens?.questions ?? []).filter((question) => question.kind !== 'intake' && question.slots.some((slot) => next.slots.includes(slot)));
  const phrased = await context.models.phrase({
    round: next.slots,
    slots: viewsOf(context, session.brief),
    bank,
    asked: session.brief.questions.map((question) => question.text),
  });
  if (!phrased.ok) {
    return phrased;
  }
  const questions = phrased.value.map((question) => ({ id: `${question.slots[0] ?? next.lens}-${context.stamp.call}`, ...question }));
  return { ok: true, value: { kind: 'asked', questions } };
};

/** The event a model makes for what comes next, or null when it's the person's turn. */
const eventFor = async (context: Context, session: Session): Promise<Read<Event> | null> => {
  const { next } = session;
  switch (next.kind) {
    case 'intake': {
      const lens = context.lenses.find((each) => each.name === next.lens);
      return { ok: true, value: { kind: 'asked', questions: lens === undefined ? [] : intakeQuestions(lens) } };
    }
    case 'classify':
      return classifyIntake(context.models, session.entries);
    case 'ask':
      return phrase(context, session, next);
    case 'draft':
      return draftPlan({ models: context.models, store: context.store, name: context.request.slug, lenses: context.lenses }, session.brief, next);
    default:
      return null;
  }
};

const DONE: Read<Event> = { ok: true, value: { kind: 'done' } };

/** Whether "done" can come now: at a round waiting for answers, or one about to be phrased. */
const doneNow = (session: Session): boolean => session.next.kind === 'answer' || session.next.kind === 'ask';

/** Carries the session on until it's the person's turn, taking "done" at the first point it can come. */
const carry = async (context: Context, start: Session): Promise<Read<Session>> => {
  let session = start;
  let done = context.request.done;
  for (;;) {
    const due = done && doneNow(session);
    const event = due ? DONE : await eventFor(context, session);
    if (event === null) {
      return { ok: true, value: session };
    }
    const taken = event.ok ? await take(context, session, event.value) : event;
    if (!taken.ok) {
      return taken;
    }
    done = done && !due;
    session = taken.value;
  }
};

/** The lens a question asks about, by its first slot. */
const lensOf = (brief: Brief, question: Question | undefined): string =>
  brief.slots.find((state) => state.slot.id === question?.slots[0])?.slot.lens ?? '';

/** What a session waiting on the person shows them. */
const shownOf = (context: Context, session: Session): Read<Shown> => {
  const { next, brief, phase } = session;
  switch (next.kind) {
    case 'answer':
      return { ok: true, value: { kind: 'questions', lens: lensOf(brief, next.questions[0]), questions: next.questions } };
    case 'play':
      return { ok: true, value: { kind: 'chunk', id: chunkId(next.chunk), place: next.chunk + 1, of: phase.draft?.chunks.length ?? 0, text: next.text } };
    case 'accept':
      return { ok: true, value: { kind: 'accept', id: chunkId(phase.draft?.play.at(-1) ?? 0) } };
    case 'accepted':
      return { ok: true, value: { kind: 'accepted', path: join(context.request.project, 'keyframes.md') } };
    case 'no-planner':
      return { ok: true, value: { kind: 'no-planner', message: NO_PLANNER, work: brief.work, size: brief.size } };
    default:
      return refused(`the session stopped while waiting for ${next.kind}`);
  }
};

/** Accepts the draft when the playback has ended with nothing corrected and its check is clean, and logs it. */
const accept = async (context: Context, session: Session): Promise<Reached> => {
  if (session.next.kind === 'accepted') {
    return { session, result: shownOf(context, session) };
  }
  if (session.next.kind !== 'accept') {
    return { session, result: refused(`there's no draft to accept yet: the playback has to end with nothing corrected, and the session is at ${session.next.kind}`) };
  }
  const accepted = await acceptPlan(context.store);
  if (!accepted.ok) {
    return { session, result: { ok: true, value: { kind: 'refused', problem: accepted.problem } } };
  }
  const taken = await take(context, session, { kind: 'accepted' });
  return taken.ok ? { session: taken.value, result: { ok: true, value: { kind: 'accepted', path: accepted.value } } } : { session, result: taken };
};

/** Takes what the person said, carries the session on until it's their turn again, and accepts when asked. */
const drive = async (context: Context, start: Session): Promise<Reached> => {
  if (context.request.done && start.brief.size === null && Object.values(context.request.answers).every((text) => text.trim() === '')) {
    return { session: start, result: refused("\"done\" can't come during intake: its answers come first") };
  }
  const heard = await hear(context, start);
  if (!heard.ok) {
    return { session: start, result: heard };
  }
  const carried = await carry(context, heard.value);
  if (!carried.ok) {
    return { session: heard.value, result: carried };
  }
  return context.request.accept ? accept(context, carried.value) : { session: carried.value, result: shownOf(context, carried.value) };
};

/**
 * Runs one turn of the interview for the session `slug` in the project folder `project`: it takes
 * what the person said, carries the session on until it's their turn again, and gives what to show
 * them. A turn that stops short keeps every entry it appended, so the next call carries on from
 * there, and renders `brief.md` all the same.
 */
export const runTurn = async ({ models, now }: Deps, request: Request): Promise<Read<Shown>> => {
  const lenses = await loadLenses(LENSES, ORDER);
  if (!lenses.ok) {
    return lenses;
  }
  const store = openStore(request.project, request.slug);
  if (!store.ok) {
    return store;
  }
  const entries = await store.value.load();
  if (!entries.ok) {
    return fromFile('answers.jsonl', entries);
  }
  const resumed = resume(
    lenses.value.flatMap((lens) => lens.slots),
    entries.value,
  );
  if (!resumed.ok) {
    return fromFile('answers.jsonl', resumed);
  }
  const context: Context = { models, store: store.value, lenses: lenses.value, request, stamp: { call: resumed.value.call + 1, at: now() } };
  const { session, result } = await drive(context, resumed.value);
  if (session.entries.length === 0) {
    return result;
  }
  const rendered = await store.value.render(session.brief);
  return rendered.ok ? result : rendered;
};
