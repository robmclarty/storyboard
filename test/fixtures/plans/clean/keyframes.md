# inkwell

## Intent

Inkwell keeps one person's notes in step between a phone and a laptop, for someone who writes on
planes. Good looks like an edit that's never lost. It isn't a team wiki.

## Principles

- **P1 (local-first)**: The device holds the truth; the server only relays.

## Constraints

- **C1 (one-writer)**: Only the sync worker writes to the database, per [P1 (local-first)].
  - because: two writers made the replay disagree with the live state.

## Decisions

- **D1 (sqlite)**: Each device keeps its notes in one SQLite file.
  - because: one file is easy to back up and to reason about.

## Taste

- **T1 (quiet)**: It never interrupts the writing with a dialog.

## Questions

- **Q1 (merging)**: How should two edits to the same line merge? Lean: keep both, marked.

## Ideas

- **I1 (sharing)**: A read-only link to one note.
