# Intent: questions

Broad to narrow. Intake belongs to the frame lens, so every question here offers a menu or asks
openly with a recommendation beside it. When a question asks about the person's world, its
recommendation is the likeliest answer, for them to confirm. When it asks them to make a call, the
recommendation is the safest default, and the safest default is usually the one that commits the
plan to the least.

The phrase step adapts each question to what the person has already said: the options here show
the shape of a good answer, not the words to use. [The lens README](../README.md) gives the form
each question takes.

## Principles

- **principles-wins**: When two good things pull against each other, which usually wins?
  - kind: menu
  - slots: principles
  - option: Simple over complete
  - option: Correct over fast
  - option: Easy to change over easy to start
  - option: Your own control over convenience
  - recommended: Simple over complete
- **principles-away**: Think of a call someone might get wrong while you're away. What should
  they hold to?
  - kind: open
  - slots: principles
  - recommended: When unsure, do less and ask.

## Constraints

- **constraints-runs**: Where must it run?
  - kind: menu
  - slots: constraints
  - option: On your own machine
  - option: On a server you run
  - option: On someone else's cloud
  - option: Wherever its people already are, such as a browser or a phone
  - recommended: On your own machine
- **constraints-limits**: Besides what it must never do, which limit must always hold?
  - kind: menu
  - slots: constraints
  - option: No new paid service or account
  - option: No dependencies beyond what's already there
  - option: Nothing leaves the machine
  - option: None beyond the no-gos
  - recommended: None beyond the no-gos

## Decisions

- **decisions-made**: What have you already decided, and what did you pick it over?
  - kind: open
  - slots: decisions
  - recommended: Nothing is settled yet, so the draft should leave the big calls open.
- **decisions-why**: For the biggest call so far, what decided it?
  - kind: menu
  - slots: decisions
  - option: It's what you already know
  - option: It's the simplest thing that works
  - option: Something else was tried and failed
  - option: Something it depends on needs it that way
  - recommended: It's the simplest thing that works

## Taste

- **taste-feel**: How should it feel to use?
  - kind: menu
  - slots: taste
  - option: Quiet: it stays out of the way
  - option: Warm: it reads as if a person wrote it
  - option: Exact: dense, precise and fast
  - option: Playful: it has some personality
  - recommended: Quiet: it stays out of the way
- **taste-never**: Is there anything it should never look, read or feel like: a product, a habit
  or a tone?
  - kind: open
  - slots: taste
  - recommended: A generic template: stock phrases, filler and cheer it hasn't earned.

## What's still open

- **questions-unknown**: What's the biggest thing you don't know yet?
  - kind: menu
  - slots: questions
  - option: Whether anyone wants it
  - option: Whether it can be built the way you picture it
  - option: How long it will take
  - option: Nothing big
  - recommended: Whether it can be built the way you picture it
- **questions-lean**: For each thing still open, which way do you lean for now?
  - kind: open
  - slots: questions
  - recommended: The simplest option, until building it shows otherwise.

## Ideas

- **ideas-later**: Is there anything you'd like it to do someday, but not in this version?
  - kind: open
  - slots: ideas
  - recommended: Nothing for now.
