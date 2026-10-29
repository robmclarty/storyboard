---
name: frame
description: "The frame lens: what the work is, who it's for, what it's worth, what it must never do, what done looks like and what it builds on. Intake's three questions are its first."
---

# Frame

The frame lens finds out what the work is before anyone asks how it should be. Its slots draft
the plan's Intent, the prose a new teammate reads first, and its no-gos draft Constraints. Every
lens after it builds on these answers, so a vague frame makes every later question vaguer.

Intake's three open questions are this lens's first. They count against its five questions, so
after intake it has two left.

## Slots

| Slot | Holds | Impact | Lands in |
| --- | --- | --- | --- |
| problem | The problem it solves, and what happens today without it | 3 | Intent |
| audience | Who it's for, and who else reads or runs what it makes | 3 | Intent |
| appetite | How much time it's worth, and what gives first when time runs short | 2 | Intent |
| no-gos | What it must never do, even when doing it would help | 3 | Constraints |
| done | What done looks like: what someone can do, see or stop doing once it works | 3 | Intent |
| prior-art | What it starts from, replaces or learns from: existing code, tools and earlier tries | 1 | Intent |

## When a slot is Clear

The interpreting model judges each slot against its line here. Anything short of it is Partial,
and a slot the person hasn't touched is Missing.

- **problem**: It says who has the problem, what they do about it today, and why that isn't good
  enough. A problem written as the lack of a solution, such as "there's no tool for X", is
  Partial.
- **audience**: It names the people who use it by what they do, not by a label such as
  "developers" or "everyone", and says whether anyone else reads or runs what it makes, such as a
  maintainer, a reviewer or a coding agent.
- **appetite**: It gives a length of time, or a size the person would stop at, and says what
  gives first when time runs short: the scope, the polish or the date. A wish such as "as soon as
  possible" is Partial.
- **no-gos**: Each one is a thing the work must never do, specific enough that someone could tell
  they'd crossed it, or the person has said there are none. A value such as "be secure" is
  Partial until it's a line.
- **done**: It's something someone could see happen: a person doing a thing with it, a check
  passing or a number reached. A feeling such as "it works well" is Partial.
- **prior-art**: It names what the work starts from, whether code, a tool, an earlier try or
  nothing at all, and what it keeps, replaces or avoids from each.

## When it's the biggest gap

Always at the start: intake opens every session with this lens's three questions, before the
work is classified. After intake, it competes with the intent lens. A slot intake left Partial
counts for half its impact, so an intent slot nobody has asked about yet outranks it, and the
frame's two remaining questions usually come after the intent lens's rounds. They go to whichever
of its slots are vaguest then, the problem, the audience, the no-gos and what done looks like
first. A slot still open after that becomes an open Question in the draft, with its recommended
answer as the lean.
