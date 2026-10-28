import { readLog, replay, writeEntry, type Brief, type Entry, type Question, type Read, type Slot } from './brief/index.js';
import { CAPS, schedule, type Caps, type OpenQuestion } from './scheduler.js';

// One turn of the interview, as a pure step: the session so far and one event go in, and the log
// entry it adds, the brief after it and what comes next come out. An event is what the person
// said or what a model made, already read; the turn decides nothing a model should, and calls
// nothing. A session is its entries, so resuming from them gives back the same brief and the same
// next step, which is what lets a session survive a crash and move between front ends.

/** The entry of one kind. */
type Of<K extends Entry['kind']> = Extract<Entry, { kind: K }>;

/**
 * Something that happened since the last turn: an entry without its time. The turn numbers a
 * playback's chunk itself, so a pass or a correction never names one.
 */
export type Event =
  | Omit<Of<'asked'>, 'at'>
  | Omit<Of<'answered'>, 'at'>
  | Omit<Of<'classified'>, 'at'>
  | Omit<Of<'done'>, 'at'>
  | Omit<Of<'drafted'>, 'at'>
  | Omit<Of<'passed'>, 'at' | 'chunk'>
  | Omit<Of<'corrected'>, 'at' | 'chunk'>
  | Omit<Of<'accepted'>, 'at'>;

/** A correction made in playback, word for word, with the chunk it was made on. */
type Correction = Pick<Of<'corrected'>, 'chunk' | 'text' | 'items'>;

/** What comes next, for the flow to carry out or the person to answer. */
export type Next =
  /** Ask intake's open questions, from the first lens. */
  | { readonly kind: 'intake'; readonly lens: string }
  /** Wait for the person's answers to these questions. */
  | { readonly kind: 'answer'; readonly questions: readonly Question[] }
  /** Read the work's kind and size from intake's answers. */
  | { readonly kind: 'classify' }
  /** Phrase one question for each of these slots, or fewer: the scheduler's next round. */
  | { readonly kind: 'ask'; readonly lens: string; readonly slots: readonly string[] }
  /**
   * Draft from the brief, with every open slot as a Question. A redraft gets the draft before it
   * and the corrections made on it, word for word (D19 (corrections-as-entries)).
   */
  | {
      readonly kind: 'draft';
      readonly open: readonly OpenQuestion[];
      readonly previous: readonly string[] | null;
      readonly corrections: readonly Correction[];
    }
  /** Play this chunk of the draft back and hear what's wrong or missing. */
  | { readonly kind: 'play'; readonly chunk: number; readonly text: string }
  /** The playback ended with nothing corrected: ask the person to accept. */
  | { readonly kind: 'accept' }
  /** The session is over: the draft was accepted. */
  | { readonly kind: 'accepted' }
  /** The session is over: the work is too small to need a plan. */
  | { readonly kind: 'no-planner' };

/** The latest draft, and how far its playback has got. */
type Draft = {
  readonly chunks: readonly string[];
  /** The chunks to play back, by index, in order: only those whose text changed, after a redraft. */
  readonly play: readonly number[];
  /** How many passes and corrections it has heard. */
  readonly heard: number;
  readonly corrections: readonly Correction[];
};

/** Where the session is, beyond what the brief holds. */
type Phase = {
  readonly asked: boolean;
  /** The round waiting for answers: the last questions asked, until an answer or a done. */
  readonly pending: readonly Question[];
  readonly done: boolean;
  readonly draft: Draft | null;
  readonly accepted: boolean;
};

/** A session: its slots and caps, its entries, the brief they give and what comes next. */
export type Session = {
  readonly slots: readonly Slot[];
  readonly caps: Caps;
  readonly entries: readonly Entry[];
  readonly brief: Brief;
  readonly next: Next;
  readonly phase: Phase;
};

/** The indices of `chunks` to play back: every one, or after a redraft only those that changed. */
const toPlay = (chunks: readonly string[], previous: readonly string[] | null): readonly number[] => {
  const all = chunks.map((_, index) => index);
  const changed = previous === null ? all : all.filter((index) => !previous.includes(chunks[index] ?? ''));
  return changed.length === 0 ? all : changed;
};

/** Moves the phase on past an entry. */
const advance = (phase: Phase, entry: Entry): Phase => {
  const { draft } = phase;
  switch (entry.kind) {
    case 'asked':
      return { ...phase, asked: true, pending: entry.questions };
    case 'answered':
      return { ...phase, pending: [] };
    case 'done':
      return { ...phase, done: true, pending: [] };
    case 'drafted': {
      const play = toPlay(entry.chunks, draft?.chunks ?? null);
      return { ...phase, draft: { chunks: entry.chunks, play, heard: 0, corrections: [] } };
    }
    case 'passed':
      return draft === null ? phase : { ...phase, draft: { ...draft, heard: draft.heard + 1 } };
    case 'corrected': {
      const correction = { chunk: entry.chunk, text: entry.text, items: entry.items };
      return draft === null
        ? phase
        : { ...phase, draft: { ...draft, heard: draft.heard + 1, corrections: [...draft.corrections, correction] } };
    }
    case 'accepted':
      return { ...phase, accepted: true };
    default:
      return phase;
  }
};

/** Every open slot, as the scheduler gives them at the draft. */
const openOf = (brief: Brief, caps: Caps): readonly OpenQuestion[] => {
  const drafted = schedule(brief, { done: true, caps });
  return drafted.kind === 'draft' ? drafted.open : [];
};

/** What comes next in a playback: the next chunk, a redraft once something was corrected, or the accept. */
const playback = (draft: Draft, brief: Brief, caps: Caps): Next => {
  const chunk = draft.play[draft.heard];
  if (chunk !== undefined) {
    return { kind: 'play', chunk, text: draft.chunks[chunk] ?? '' };
  }
  return draft.corrections.length === 0
    ? { kind: 'accept' }
    : { kind: 'draft', open: openOf(brief, caps), previous: draft.chunks, corrections: draft.corrections };
};

/** What comes next, from the brief and the phase. */
const decide = (slots: readonly Slot[], brief: Brief, phase: Phase, caps: Caps): Next => {
  if (phase.accepted) {
    return { kind: 'accepted' };
  }
  if (phase.draft !== null) {
    return playback(phase.draft, brief, caps);
  }
  if (!phase.asked) {
    return { kind: 'intake', lens: slots[0]?.lens ?? '' };
  }
  if (phase.pending.length > 0) {
    return { kind: 'answer', questions: phase.pending };
  }
  if (brief.size === null) {
    return { kind: 'classify' };
  }
  if (brief.size === 'tiny') {
    return { kind: 'no-planner' };
  }
  const next = schedule(brief, { done: phase.done, caps });
  return next.kind === 'ask' ? next : { kind: 'draft', open: next.open, previous: null, corrections: [] };
};

/** When each event may come: the next steps it answers. */
const WHEN: { readonly [K in Event['kind']]: readonly Next['kind'][] } = {
  asked: ['intake', 'ask'],
  answered: ['answer'],
  classified: ['classify'],
  done: ['answer', 'ask'],
  drafted: ['draft'],
  passed: ['play'],
  corrected: ['play', 'accept'],
  accepted: ['accept'],
};

/** What the session waits for at each next step, for a message about an event that came too soon or too late. */
const AWAITING: { readonly [K in Next['kind']]: string } = {
  intake: "intake's questions",
  answer: "the person's answers",
  classify: "intake's read of the work",
  ask: "the next round's questions",
  draft: 'a draft',
  play: 'a pass or a correction on the chunk being played',
  accept: 'an accept, or a correction',
  accepted: 'nothing, since the draft was accepted',
  'no-planner': 'nothing, since the work needs no planner',
};

/** The first slot named twice across `questions`, if one is. */
const namedTwice = (questions: readonly Question[]): string | undefined => {
  const named = questions.flatMap((question) => question.slots);
  return named.find((id, index) => named.indexOf(id) !== index);
};

/** Why intake's questions can't be asked: more than three, a menu, or a slot outside the first lens. */
const intakeProblem = (slots: readonly Slot[], questions: readonly Question[], lens: string): string | undefined => {
  if (questions.length > 3) {
    return `intake asks three questions at most, and this asks ${questions.length}`;
  }
  const menu = questions.find((question) => question.options.length > 0);
  if (menu !== undefined) {
    return `intake's questions are open, and "${menu.id}" has a menu`;
  }
  const lenses = new Map(slots.map((slot) => [slot.id, slot.lens]));
  const outside = questions.flatMap((question) => question.slots).find((id) => lenses.get(id) !== lens);
  return outside === undefined ? undefined : `intake asks about the ${lens} lens, and "${outside}" isn't in it`;
};

/** Why a phrased round can't be asked: a slot the round didn't pick, or one asked about twice. */
const roundProblem = (questions: readonly Question[], picked: readonly string[]): string | undefined => {
  const question = questions.find((each) => each.slots.some((id) => !picked.includes(id)));
  if (question !== undefined) {
    return `the question "${question.id}" asks about a slot this round didn't pick, which picked ${picked.join(', ')}`;
  }
  const twice = namedTwice(questions);
  return twice === undefined ? undefined : `two questions ask about "${twice}", and a round asks one question a slot`;
};

/** Why an event can't come now, or undefined when it can. */
const problemWith = (session: Session, event: Event): string | undefined => {
  const { next } = session;
  if (!WHEN[event.kind].includes(next.kind)) {
    return `"${event.kind}" can't come now: the session is waiting for ${AWAITING[next.kind]}`;
  }
  if (event.kind === 'asked') {
    return next.kind === 'intake'
      ? intakeProblem(session.slots, event.questions, next.lens)
      : roundProblem(event.questions, next.kind === 'ask' ? next.slots : []);
  }
  if (event.kind === 'answered') {
    const waiting = next.kind === 'answer' ? next.questions.map((question) => question.id) : [];
    const stray = event.answers.find((answer) => !waiting.includes(answer.question));
    return stray === undefined ? undefined : `the question "${stray.question}" isn't waiting for an answer`;
  }
  return event.kind === 'done' && session.brief.size === null
    ? "\"done\" can't come during intake: its answers come first"
    : undefined;
};

/** The chunk a pass or a correction is about: the one being played, or the last one played. */
const chunkNow = (session: Session): number =>
  session.next.kind === 'play' ? session.next.chunk : (session.phase.draft?.play.at(-1) ?? 0);

/** Takes one entry onto the session, refusing one that can't come now. */
const step = (session: Session, entry: Entry): Read<Session> => {
  const problem = problemWith(session, entry);
  if (problem !== undefined) {
    return { ok: false, problem };
  }
  if ((entry.kind === 'passed' || entry.kind === 'corrected') && entry.chunk !== chunkNow(session)) {
    return { ok: false, problem: `the entry is about chunk ${entry.chunk}, and the playback is at chunk ${chunkNow(session)}` };
  }
  const entries = [...session.entries, entry];
  const brief = replay(session.slots, entries);
  if (!brief.ok) {
    return { ok: false, problem: brief.problem };
  }
  const phase = advance(session.phase, entry);
  return { ok: true, value: { ...session, entries, brief: brief.value, phase, next: decide(session.slots, brief.value, phase, session.caps) } };
};

/**
 * Resumes a session from its log: every entry is taken as the turn that wrote it would have, so
 * the brief and the next step are the same as when the last one was written. An entry that
 * couldn't have come when it did is refused with its line, counting the first entry as line 1.
 */
export const resume = (slots: readonly Slot[], entries: readonly Entry[], caps: Caps = CAPS): Read<Session> => {
  if (slots.length === 0) {
    return { ok: false, problem: 'a session needs a lens with slots' };
  }
  const brief = replay(slots, []);
  if (!brief.ok) {
    return brief;
  }
  const phase: Phase = { asked: false, pending: [], done: false, draft: null, accepted: false };
  let session: Session = { slots, caps, entries: [], brief: brief.value, phase, next: decide(slots, brief.value, phase, caps) };
  for (const [index, entry] of entries.entries()) {
    const stepped = step(session, entry);
    if (!stepped.ok) {
      return { ok: false, line: index + 1, problem: stepped.problem };
    }
    session = stepped.value;
  }
  return { ok: true, value: session };
};

/**
 * Runs one turn: the event, at the time given, goes in, and the log entry it adds and the session
 * after it come out. The entry is exactly the line the log will hold. An event that can't come
 * now is refused, and the session is as it was.
 */
export const turn = (session: Session, event: Event, at: string): Read<{ readonly entry: Entry; readonly session: Session }> => {
  const written = writeEntry(
    event.kind === 'passed' || event.kind === 'corrected' ? { ...event, at, chunk: chunkNow(session) } : { ...event, at },
  );
  if (!written.ok) {
    return written;
  }
  const read = readLog(written.value);
  const entry = read.ok ? read.value[0] : undefined;
  if (entry === undefined) {
    return { ok: false, problem: "the entry didn't read back from its line" };
  }
  const stepped = step(session, entry);
  return stepped.ok ? { ok: true, value: { entry, session: stepped.value } } : stepped;
};
