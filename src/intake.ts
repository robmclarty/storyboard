import type { Entry, Question, Read } from './brief/index.js';
import type { Lens } from './lens.js';
import type { Models, Said } from './models/index.js';
import type { Event } from './turn.js';

// Intake opens every session: the first lens's three open questions, with no menus, since options
// steer before the person has said what they mean (C8 (broad-then-narrow)). Their answers go to the
// local model, which reads the work's kind and size. This goal uses the size only to end a tiny
// piece of work with no planner (D20 (four-sizes)); both are logged for the lenses to come.

/** What a session that's too small for a plan ends with. */
export const NO_PLANNER = "No planner needed: this is small enough to make the change without a plan.";

/** Intake's questions, as the first lens's bank gives them: open, recommending nothing. */
export const intakeQuestions = (lens: Lens): readonly Question[] =>
  lens.questions
    .filter((question) => question.kind === 'intake')
    .map(({ id, slots, text }) => ({ id, slots, text, options: [], recommended: null }));

/** What intake asked and what the person said to it, from the log: the first round asked, and every answer to it. */
const intakeSaid = (entries: readonly Entry[]): readonly Said[] => {
  const asked = entries.find((entry) => entry.kind === 'asked');
  const questions = asked?.kind === 'asked' ? asked.questions : [];
  return entries.flatMap((entry) =>
    entry.kind === 'answered'
      ? entry.answers.flatMap(({ question, text }) => {
          const found = questions.find((each) => each.id === question);
          return found === undefined ? [] : [{ asked: found.text, about: found.slots, answer: text }];
        })
      : [],
  );
};

/** Reads the work's kind and size from intake's answers in the log, as the event the core takes. */
export const classifyIntake = async (models: Models, entries: readonly Entry[]): Promise<Read<Event>> => {
  const read = await models.classify(intakeSaid(entries));
  return read.ok ? { ok: true, value: { kind: 'classified', work: read.value.work, size: read.value.size } } : read;
};
