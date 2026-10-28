# AGENTS.md

Instructions for any coding agent working in this repository.

## What this is

storyboard interviews a person broad to narrow, then drafts the intent, spec, design and map the
rest of the toolchain builds from. Read these before you change code:

- [`docs/specs/initial_sketch.md`](docs/specs/initial_sketch.md): the idea, the reasoning
  behind it, and the build order.
- [`docs/architecture.md`](docs/architecture.md): the map. It says which module owns what, which
  ring each module is in, and which module owns each effect.

The sketch's open questions are open. Raise one when your work runs into it; don't settle it on
your own.

<!-- checkride:begin hash=v11a6c9d09ff52a3ac -->

## Checkride: the definition of done

`pnpm check` is the single source of truth for "done". Exit 0 means the work is
complete; any other exit code means it is not. Never claim a task is finished while
`pnpm check` is red.

When it fails:

1. Read `.check/summary.json` to see which check failed.
2. Read that check's raw output: `.check/<slot>.json` or `.jsonl`, `.check/<slot>.stdout.txt`,
   or `.check/<slot>.stderr.txt`, where a check refused before it ran says why. A
   target's check writes under `.check/<target>/` instead.
3. Fix the root cause, then re-run.

`pnpm check --digest` prints a capped excerpt of what failed below its report,
each section naming the raw file that holds the rest, so start from that.

`pnpm exec checkride triage` runs this procedure in full and reads `.check/` for you
(`/checkride:check` and `/checkride-check` are the same thing as a skill).

Tight feedback loops: `pnpm check --bail`, `pnpm check --only types,lint`, and
`pnpm check --changed`.

If a stop-gate hook is configured (`.claude/settings.json` or `.cursor/hooks.json`),
it runs the check when a turn ends — so while iterating, prefer the narrow commands
above rather than running the full check yourself every loop. Read the gate's verdict
rather than assuming it covered everything: a repo can narrow the gate with `gate` in
`checkride.config.json`, and a narrowed one names its narrowing (`only …`, `without …`,
`affected-only`) in every verdict. That green is not the "done" defined above; run
`pnpm check` in full before you claim the work is finished.

### Baseline

If `checkride.baseline.json` is present, checkride grandfathers the diagnostics it
lists: a slot is green as long as only baselined findings remain, while a genuinely
new diagnostic still fails it. Fixing a baselined finding prunes it from the file —
the ratchet, so the baseline only ever shrinks. Never add to the baseline to make a
check pass; fix the finding.

### Module boundaries

The `struct` check runs whatever ast-grep rules `sgconfig.yml` points at
(`rules/` by default). Those files are this repo's boundary convention —
read them rather than assuming one.

Active checks in this repo: types, lint, struct, dead, test, docs, links, spell, typecheck-tests, rule-tests.

<!-- checkride:end -->

## Repository layout

Each rule below fails the gate. [`docs/architecture.md`](docs/architecture.md) explains why.

- **Rings** (`fallow.toml`, `boundaries`):
  - every file in `src/` belongs to one ring: core, an edge, wiring, shells or tests;
  - a ring imports only the rings below it, and an edge imports only the core;
  - the core calls nothing impure: no `fs`, `child_process`, `fetch`, `Date.now`,
    `Math.random`, `process` or `fascicle`.
- **Doors** (`rules/`): one module per effect.
  - Only `src/store/` writes files (`writes-only-in-store`).
  - Only `src/keyframes/` starts a process (`subprocess-only-in-keyframes`).
  - Only `src/models/` calls a model or the network (`model-calls-only-in-models`).
- **A new module** goes on the map in the same change: add it to its zone in `fallow.toml` and
  a row in `docs/architecture.md`. If it needs an effect its ring doesn't allow, stop and ask.
- **Modules** start as a file. A module that grows becomes a folder whose `index.ts` re-exports
  only (`no-logic-in-barrel`), and siblings import that index, never its internals
  (`no-deep-sibling-import`).
- **Unit tests** sit in a `__tests__/` folder beside the code they cover
  (`colocate-unit-tests`). `test/` holds `integration/`, `e2e/`, `contract/`, `helpers/` and
  `fixtures/` only (`test-dir-layout`).
- **Functional style**: no classes (`no-class`), named exports only (`no-default-export`).

Door rules have fixtures in `rule-tests/`; record snapshots with `pnpm exec ast-grep test -U`.
Fixtures can't see paths, so `test/integration/layout.test.ts` checks where each ring and door
applies by scanning a real tree. Change a zone or a door and that test changes with it.
