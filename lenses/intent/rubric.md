# Intent: rubric

The intent lens's slots draft keyframes' items: Principles, Constraints, Decisions, Taste,
Questions and Ideas. An agent treats each section differently, so an item goes where the person's
words put it, and only once. Everything here holds only what the person said or confirmed.

## A good item, section by section

- **Principles**: a value that settles a judgment call, written so it picks a side: "Simple over
  complete". Three to five is plenty. Each one is the person's, never a value every project would
  claim.
- **Constraints**: what must always be true, which an agent stops and asks before crossing. Each
  is one line someone could check. Only what the person called a hard limit belongs here: a
  preference is Taste, and a wish is an Idea.
- **Decisions**: what was chosen, in one sentence, with a `because:` that says why it beat what
  else was weighed. Only calls the person made or confirmed. A call the brief doesn't settle is a
  Question with a lean, never a Decision.
- **Taste**: how the work should look, read or feel, in words someone could follow: "Every error
  says what's wrong and how to fix it", not "great UX". What it should never feel like, when the
  person said.
- **Questions**: a real question that still needs an answer, with the lean at the end of its own
  text: "How should two edits to the same line merge? Lean: keep both." Every slot still open at
  the draft is one, whichever section it would have landed in.
- **Ideas**: a statement for later, not a promise: "A read-only link to one note." Only what the
  person raised.

## Budgets

`keyframes check --strict` fails a plan past its budgets, and storyboard doesn't trim, so the
draft stays inside them:

- 60 words for an item's text;
- 7 principles, 12 constraints, 20 decisions, 12 taste items, 10 open questions and 10 ideas;
- 2000 words in the whole plan, its Intent included, where a word is anything between spaces,
  markup too.

A draft with more open questions than that comes back in the playback with the count, and the
person settles enough of them to bring it under.

## Defaults to steer away from

- Principles every project claims: "quality", "user first", or "simplicity" with no side picked.
- Constraints drawn from best practice the person never set: "must be secure", "must scale",
  "full test coverage".
- Decisions the model made for the person: a language, a framework or a database nobody named.
- A `because:` that restates the decision: "SQLite, because SQLite fits."
- Taste as adjectives: "clean", "modern", "intuitive", "delightful".
- Questions that are really tasks, such as "Write the tests", or that the brief already answers.
- Ideas padded out to fill the section.
- One thing said twice: a no-go is a Constraint once, not also a Principle.
