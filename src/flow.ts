import type { Brief, Question, Read, Stamp } from './brief/index.js';
import { classifyIntake, intakeQuestions, NO_PLANNER } from './intake.js';
import { LENSES, loadLenses, type Lens } from './lens.js';
import type { Models, Said, SlotView } from './models/index.js';
import { openStore, type Store } from './store.js';
import { resume, turn, type Event, type Next, type Session } from './turn.js';

// One `storyboard turn` call (D10 (one-turn-command)). It loads the session from its files, takes
// the person's answers, read by `interpret` into slot updates (D1 (interpreted-answers)), then
// carries out whatever comes next that a model can: intake's questions, the classification, the
// next round phrased. It stops where the person has to speak again. Each entry is appended as the
// core takes it, so every answer and its reading are on disk before the next model call can fail,
// and `brief.md` is rendered from the session at the end (D11 (log-is-truth)). The models come in
// as an argument, so a test hands the flow a fake (D9 (models-injected)).

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
  /** The person's answers, by question id, word for word. A blank one is no answer. */
  readonly answers: Readonly<Record<string, string>>;
  /** The person has said done: draft now. */
  readonly done: boolean;
};

/** What the call shows the person once it stops. */
export type Shown =
  /** Questions waiting for answers, by id, all about one lens's slots. */
  | { readonly kind: 'questions'; readonly lens: string; readonly questions: readonly Question[] }
  /** The session is over: the work is too small to need a plan. */
  | { readonly kind: 'no-planner'; readonly message: string; readonly work: Brief['work']; readonly size: Brief['size'] };

/** What a call works with: the models, the session's store, the lenses and the call's stamp. */
type Context = {
  readonly models: Models;
  readonly store: Store;
  readonly lenses: readonly Lens[];
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

/** Takes one event onto the session through the core, and appends the entry it adds. */
const take = async (context: Context, session: Session, event: Event): Promise<Read<Session>> => {
  const taken = turn(session, event, context.stamp);
  if (!taken.ok) {
    return taken;
  }
  const appended = await context.store.append(taken.value.entry);
  return appended.ok ? { ok: true, value: taken.value.session } : appended;
};

/** Reads the person's answers into slot updates, and takes them, refusing answers nothing is waiting for. */
const answer = async (context: Context, session: Session, answers: readonly (readonly [string, string])[]): Promise<Read<Session>> => {
  const { next } = session;
  if (next.kind !== 'answer') {
    return refused(`no questions are waiting for answers, so these can't be taken: ${answers.map(([id]) => id).join(', ')}`);
  }
  const said: Said[] = [];
  for (const [id, text] of answers) {
    const question = next.questions.find((each) => each.id === id);
    if (question === undefined) {
      return refused(`the question "${id}" isn't waiting for an answer: the questions waiting are ${next.questions.map((each) => each.id).join(', ')}`);
    }
    said.push(saidOf(question, text));
  }
  const updates = await context.models.interpret({ slots: viewsOf(context, session.brief), said });
  if (!updates.ok) {
    return updates;
  }
  return take(context, session, { kind: 'answered', answers: answers.map(([question, text]) => ({ question, text })), updates: updates.value });
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
      return refused("the session is ready to draft, and drafting isn't built yet");
    default:
      return null;
  }
};

/** The lens a question asks about, by its first slot. */
const lensOf = (brief: Brief, question: Question | undefined): string =>
  brief.slots.find((state) => state.slot.id === question?.slots[0])?.slot.lens ?? '';

/** What a session waiting on the person shows them. */
const shownOf = (session: Session): Read<Shown> => {
  const { next, brief } = session;
  switch (next.kind) {
    case 'answer':
      return { ok: true, value: { kind: 'questions', lens: lensOf(brief, next.questions[0]), questions: next.questions } };
    case 'no-planner':
      return { ok: true, value: { kind: 'no-planner', message: NO_PLANNER, work: brief.work, size: brief.size } };
    default:
      return refused(`the session is waiting for what this build can't show yet: ${next.kind}`);
  }
};

/** Whether "done" can come now: at a round waiting for answers, or one about to be phrased. */
const doneNow = (session: Session): boolean => session.next.kind === 'answer' || session.next.kind === 'ask';

const DONE: Read<Event> = { ok: true, value: { kind: 'done' } };

/**
 * Carries the session on from the person's answers until it's their turn again. "Done" is taken
 * at the first point it can come, and refused during intake, whose answers come first.
 */
const drive = async (context: Context, start: Session, request: Request): Promise<Reached> => {
  let session = start;
  const answers = Object.entries(request.answers).filter(([, text]) => text.trim() !== '');
  if (request.done && session.brief.size === null && answers.length === 0) {
    return { session, result: refused("\"done\" can't come during intake: its answers come first") };
  }
  if (answers.length > 0) {
    const answered = await answer(context, session, answers);
    if (!answered.ok) {
      return { session, result: answered };
    }
    session = answered.value;
  }
  let done = request.done;
  for (;;) {
    const due = done && doneNow(session);
    const event = due ? DONE : await eventFor(context, session);
    if (event === null) {
      return { session, result: shownOf(session) };
    }
    const taken = event.ok ? await take(context, session, event.value) : event;
    if (!taken.ok) {
      return { session, result: taken };
    }
    done = done && !due;
    session = taken.value;
  }
};

/**
 * Runs one turn of the interview for the session `slug` in the project folder `project`: it takes
 * the person's answers, carries the session on until it's their turn again, and gives what to show
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
  const context: Context = { models, store: store.value, lenses: lenses.value, stamp: { call: resumed.value.call + 1, at: now() } };
  const { session, result } = await drive(context, resumed.value, request);
  if (session.entries.length === 0) {
    return result;
  }
  const rendered = await store.value.render(session.brief);
  return rendered.ok ? result : rendered;
};
