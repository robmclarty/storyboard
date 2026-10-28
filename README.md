# storyboard

storyboard interviews a person the way 20 questions works: open and broad first, then narrow,
each question chosen to cut the most uncertainty, until it knows enough to draft. Then it drafts
first versions of what the rest of the toolchain builds from:

- `keyframes.md` for intent;
- `spec.md` for behavior;
- design tiles and tokens for how it looks;
- a map of the parts.

A person corrects them; nothing is signed blind. The drafts feed volley, plumbbob, runciter,
ridgeline or a person.

In animation, storyboards come before keyframes, and they're drawn broad before they're tight.

## Status

Not built yet. This repo holds the container for the first build: the layout, the rules that
hold it, and the gate that says when a change is done. The `storyboard` command answers only
`--help` and `--version` for now.

- [The sketch](docs/specs/initial_sketch.md) is the idea, the reasoning behind it, and the build
  order.
- [The architecture](docs/architecture.md) is the map the build fills.

## How it will work

- **One planner, one loop.** Every turn is one pure step: the brief and an answer go in, an
  updated brief and the next questions come out. The brief lives in files, in
  `.storyboard/<slug>/`, so a session survives a crash and moves between front ends.
- **Lenses instead of agents.** Frame, intent, behavior, design and architecture are lenses: each
  owns some slots, a question bank and a drafting rubric. The scheduler asks next about the slot
  with the highest impact × uncertainty, and loads that slot's lens.
- **Broad, then narrow.** Early questions are open. Later ones offer two to four options, with a
  recommended answer. It stops when the person says "done", or when no question is worth its
  cost. Anything still open becomes an open question with a default beside it, never a guess.
- **Existing projects too.** It reads a project's docs and code, proposes where each decision
  belongs (the root plan, a part's plan, or the log), and writes nothing until the person
  accepts.
- **Two front ends.** A Claude Code plugin, and a CLI that also serves ACP for Zed. Both are thin
  over the same loop.
- **Local first.** A local model classifies and samples; a frontier model asks and drafts. No
  telemetry.

## Layout

```text
src/            the modules, in rings: core, edges, wiring, shells
lenses/         lens content: slots, question banks, rubrics
skills/         the Claude Code skill
.claude-plugin/ the Claude Code plugin manifest
bin/            the storyboard command
rules/          the doors: which module owns each effect
rule-tests/     a fixture for each rule
test/           integration, e2e and contract tests, helpers, fixtures
docs/           the sketch, the architecture, research and diagrams
```

The rings and the doors are enforced, not just described. See
[the architecture](docs/architecture.md) for what each module owns and why.

## Development

Needs Node 24 or later and pnpm.

```bash
pnpm install
pnpm check        # the whole pipeline; exit 0 means done
pnpm test         # the tests alone
```

`pnpm check` is [checkride](https://github.com/robmclarty/checkride). It runs types, lint, the
layout rules, dead code, tests, markdown, links and spelling. [AGENTS.md](AGENTS.md) is the
contract every agent in this repo follows.

## License

[Apache-2.0](LICENSE)
