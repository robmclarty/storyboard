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

The first interview runs end to end, from the command line, for a new project: intake's three
open questions, the frame and intent lenses, a drafted `keyframes.md` played back a chunk at a
time, and an accept that writes it only when `keyframes check --strict` passes. Existing
projects, the behavior, design and architecture lenses, and `spec.md` come later. No live
interview has been run yet, so the system prompts are first drafts.

- [The sketch](docs/specs/initial_sketch.md) is the idea, the reasoning behind it, and the build
  order.
- [The architecture](docs/architecture.md) is the map the build fills.

## Running an interview

The easiest way is from Claude Code. Put `storyboard` on your PATH (from this repo, `pnpm build`
then `pnpm link --global`), load the plugin with `claude --plugin-dir <this repo>`, set the four
settings below, and in the project's folder type `/storyboard:storyboard`. The skill asks each
question as it's given, with `AskUserQuestion` for the menus and intake's open questions in plain
chat, sends your answers back word for word, and plays the draft back a chunk at a time. It never
answers for you. Typing the command again picks the session up where it stopped.

From a terminal, `storyboard turn` runs one turn of the interview and stops where it's your turn. Run it in the
project's folder, or name one with `--dir`. The session's files go in `.storyboard/<slug>/`, and
the slug is the folder's name unless you give one.

It needs a local model on Ollama and Anthropic's API:

```bash
export STORYBOARD_LOCAL_MODEL=qwen3.6:35b
export OLLAMA_HOST=mini.local
export STORYBOARD_FRONTIER_MODEL=claude-opus-5-5
export ANTHROPIC_API_KEY=…
```

The first call asks intake's three questions. Each later call takes your answers on stdin, as a
JSON object keyed by the ids it showed, and shows the next round:

```bash
storyboard turn
echo '{"intake-1": "A notes app, for me alone.", "intake-2": "…", "intake-3": "…"}' | storyboard turn
```

When nothing is worth asking, or you pass `--done`, it drafts `keyframes.md` and plays it back a
chunk at a time. Reply under the chunk's id: a blank reply passes it, and anything else corrects
it. Corrections are redrafted after the last chunk, and only the chunks that changed come back.
Once a playback ends with nothing corrected, `storyboard turn --accept` writes `keyframes.md` to
the project, and never over one that's there. `--json` prints each turn as JSON, for a front end.

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
