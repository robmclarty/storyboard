# inkwell

## Intent

Inkwell keeps one person's notes in step between a phone and a laptop.

## Constraints

- **C1 (one-writer)**: Only the sync worker writes to the database, per [P1 (local-first)].

## Decisions

- **D1 (sqlite)**: Each device keeps its notes in one SQLite file.
- **D1 (postgres)**: The server keeps a copy in Postgres.
  - lean: one database, if it can be.
