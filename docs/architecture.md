# storyboard: architecture

This is the map the first build fills. It follows [the sketch](specs/initial_sketch.md): one
planner, one loop over one brief, and lenses instead of agents. Two files hold the map, and the
gate runs both:

- **`fallow.toml`** holds the rings: which ring each module is in, and which rings it may
  import.
- **`rules/`** holds the doors: the one module allowed each effect.

If this page and those files disagree, the files are what the gate enforces, so fix this page.
A module's ring changes in both places, in one commit.

Until storyboard has a `keyframes.md` of its own, this page stands in for its Map.

## The containers

```mermaid
flowchart LR
  P([Person])
  subgraph fronts[Front ends]
    CC[Claude Code plugin<br/>skills/storyboard]
    CLI[storyboard CLI<br/>and ACP server for Zed]
  end
  subgraph sb[storyboard]
    F[flow: the loop]
    C[core: brief, scheduler, turn,<br/>emit, adapters, place]
  end
  P <--> CC
  P <--> CLI
  CC -->|one turn at a time| CLI
  CLI --> F --> C
  F --> M[(models: the local<br/>model and the frontier)]
  F --> S[(.storyboard/slug/<br/>brief and answers log)]
  F --> R[(the project<br/>being planned)]
  F --> K[keyframes check]
  S --> O[keyframes.md, spec.md,<br/>design/, architecture.md]
  O --> T[volley, plumbbob,<br/>runciter, ridgeline]
```

- **The brief is the state.** It lives in files, so a turn can run from the CLI, from Zed over
  ACP, or from the Claude Code skill, and a session started in one can carry on in another.
- **Only the main loop asks.** Subagents keep three jobs: reading a repo into a summary,
  rendering design tiles, and sampling competing drafts.
- **Local first.** The local model classifies intake and samples drafts; the frontier model asks
  and drafts. No telemetry.

## The rings

```mermaid
flowchart TD
  subgraph shells
    direction LR
    cli
    acp
    index
  end
  subgraph wiring
    direction LR
    intake
    lens
    draft
    flow
  end
  subgraph edges
    direction LR
    models
    store
    repo
    keyframes
  end
  subgraph core
    direction LR
    brief
    scheduler
    turn
    emit
    adapters
    place
  end
  shells --> wiring --> edges --> core
```

A ring may import any ring below it. An edge imports only the core, never another edge.

| Module | Ring | Owns | Build step |
| --- | --- | --- | --- |
| `brief` | core | The record: `brief.md` as a typed brief, the slot board (Clear, Partial, Missing), and the answers log's entries | 1 |
| `scheduler` | core | The next lens and its questions, by impact × uncertainty; the caps per round and per lens; the stopping rule | 1 |
| `turn` | core | One step: the brief and an answer go in, an updated brief and the next questions come out | 1, 2 |
| `emit` | core | The emitters: `keyframes.md`, `spec.md`, design tokens and tiles, `architecture.md`; drafts cut into playback chunks | 2, 4–6 |
| `adapters` | core | Templates over the brief for volley, plumbbob, runciter and ridgeline. Not model calls | 4 |
| `place` | core | For an existing project, each item's placement (core, part or log) and a reason; the plan's budgets | 3 |
| `models` | edge | The only door to a model: the local one and the frontier one, through fascicle | 2 |
| `store` | edge | The only writer: `.storyboard/<slug>/` during the interview, and the accepted files after it | 1, 2 |
| `repo` | edge | Reads a project, its docs, its decisions and the shape of its code, into a summary with sources | 3 |
| `keyframes` | edge | The only subprocess: `keyframes check` on each emitted plan | 2 |
| `intake` | wiring | The three open questions, then the work's kind and size, which decide the lenses and the ceremony | 2 |
| `lens` | wiring | Loads a lens from [`lenses/`](../lenses/README.md) | 2 |
| `draft` | wiring | Drafts every artifact from the brief; later, samples competing drafts to find what to ask | 2, 7 |
| `flow` | wiring | The fascicle flow that runs the loop | 2 |
| `cli` | shell | The `storyboard` command, which the bin runs | now |
| `acp` | shell | The ACP server for Zed, over fascicle's | after the CLI |
| `index` | shell | The package's public surface | now |

Build steps are the sketch's [build order](specs/initial_sketch.md#build-order-when-its-time).
Only `cli` and `index` exist so far; every other module is created by the step that needs it.

### What each ring may do

| Ring | May import | Also held to |
| --- | --- | --- |
| core | other core modules | No files, processes, network, clock, randomness, environment or fascicle: `fs`, `child_process`, `fetch`, `Date.now`, `Math.random`, `process` and `fascicle` calls all fail the gate |
| edges | the core | Its own door, below |
| wiring | the core and the edges | No door of its own: it reaches a model through `models` and writes through `store` |
| shells | everything | Thin: parse the input, call the flow, print the result, return an exit code |
| tests | everything | Nothing. `src/**/__tests__/` and `test/` are a zone of their own, so a core module's tests can read fixtures |

The core is held hardest because it's where storyboard is hard to get right and cheap to test.
The sketch's first build step is "the scheduler as plain code under tests", and a pure turn means
a session replays from its files after a crash.

Every file in `src/` must belong to a ring. A file in none of them fails the gate, so a module
can't land off the map.

## The doors

| Effect | Only in | Rule |
| --- | --- | --- |
| Writing files | `store` | `writes-only-in-store` |
| Starting a process | `keyframes` | `subprocess-only-in-keyframes` |
| A model call, or the network | `models` | `model-calls-only-in-models` |

Reading files is open to every ring but the core: `store`, `repo` and `lens` all read, and the
CLI reads `package.json`. fascicle's composition primitives are open to the wiring; only its
model surface (`create_engine`, `model_call`, `model_step`) is held to `models`.

Each effect has one place to look, one place to fake in a test, and one place to ration.

## Adding a module

1. Decide its ring. If it doesn't fit one, that's a question for a person, not a new ring.
2. Add its name to that zone in `fallow.toml`, which lists both forms, `src/<name>.ts` and
   `src/<name>/**`. Add its row to the table above in the same commit.
3. Start it as a file. When it grows internals worth hiding, make it a folder whose only public
   surface is `index.ts`; siblings import that, never the internals.
4. Run `pnpm check`.

If a module needs an effect its ring doesn't allow, that's a change to the map. Raise it rather
than working around a rule.

## Front ends

Both stay thin, and neither holds state of its own.

- **The CLI** is `bin/storyboard.js`, which runs `src/cli.ts`. That returns an exit code and
  never exits the process itself. The ACP server for Zed will be `src/acp.ts`, over fascicle's.
- **The Claude Code plugin** is `.claude-plugin/plugin.json` and
  [`skills/storyboard/`](../skills/storyboard/SKILL.md). The skill asks, with
  `AskUserQuestion` and previews, and the CLI runs each turn. It ships in the same npm package,
  as plumbbob's does.

## On disk

In the project being planned, during the interview:

```text
.storyboard/<slug>/
  brief.md       every slot, its status and its value
  (answers log)  each question and answer, appended, never rewritten
```

On acceptance, the emitted files go where their readers expect them: `keyframes.md` at the root,
`spec.md`, `design/` and `architecture.md`, plus whatever the chosen adapters need. Nothing is
written until the person accepts.

## In this repo

| Path | Holds |
| --- | --- |
| `src/` | The modules above |
| `lenses/` | Lens content: slots, question banks, rubrics |
| `skills/`, `.claude-plugin/` | The Claude Code front end |
| `bin/` | The `storyboard` command |
| `rules/`, `rule-tests/` | The doors, and a fixture for each proving it fires |
| `test/` | Tests across modules: `integration/`, `e2e/`, `contract/`, `helpers/`, `fixtures/` |
| `docs/specs/` | The sketch, and specs as they're written |
| `docs/research/`, `docs/diagrams/` | Research passes and diagrams |
