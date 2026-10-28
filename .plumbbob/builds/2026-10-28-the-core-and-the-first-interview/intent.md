# The core and the first interview

**Phase** (your own bookkeeping while framing): plan
**Size:** medium
**Scope:** interview

*Source: [`docs/specs/initial_sketch.md`](../../../docs/specs/initial_sketch.md) as of `c1e5c0f`, absorbed 2026-10-28 and scoped to its build order's steps 1 and 2. The passages this goal builds from are copied under [Source](#source). [`docs/architecture.md`](../../../docs/architecture.md) and [`AGENTS.md`](../../../AGENTS.md) are the layout it builds into.*

## Frame

- **Problem:** storyboard has a map and a gate but no behavior: `storyboard` answers only `--help` and `--version`. The sketch bets that one interview loop over one brief, asking broad then narrow and always about the biggest gap, can draft a `keyframes.md` a person would sign once they've corrected it. Nothing tests that bet yet. The hard part has no code to put under tests: choosing the next question, knowing when to stop, and never guessing a decision.
- **Smallest thing that solves it:** The sketch's build order steps 1 and 2, nothing more. First the pure core: the brief's schema, the slot board, the scheduler and the turn, as plain code under tests. Then one interview end to end: intake's three open questions and the local model's read of the work's kind and size, the frame and intent lenses in `lenses/`, the keyframes emitter, the store writing `.storyboard/<slug>/`, `keyframes check` on the draft, and `storyboard turn` running one turn. Every model call goes through `src/models/` via fascicle: the local model classifies intake, and the frontier model asks and drafts. Last, one live interview redrafts a hand-written plan into a scratch directory, and its items are compared with the original's.
- **Done looks like:**
  - `pnpm check` exits 0 offline after every step. Tests fake the models edge and never call a live model.
  - An offline e2e test drives a whole interview through `storyboard turn`, from intake to an accepted `keyframes.md` that passes `keyframes check --strict`, and replaying the session's files gives back the same brief.
  - One live interview, answered by a person, redrafts keyframes' own `keyframes.md` into a scratch directory outside every repo ([D15 (redraft-keyframes)](#d15)). A record in `docs/research/` sets its items beside the hand-written ones: which matched, which it missed and which it added.
- **Explicitly NOT doing:**
  - The build order's steps 3 to 7, which are later goals: existing projects (reading a repo, placing each item in the core, a part or the log, and writing the split), the behavior lens with the spec emitter and the plumbbob and volley adapters, the design lens with its tiles and tokens, the architecture lens, and divergence sampling.
  - Map and Scenarios in the draft, and file pointers ([D5 (intent-sections)](#d5)); adapters; subagents.
  - A second front end: only the Claude Code skill gets built ([D14 (skill-first)](#d14)).
  - Anything in the pilot repos, and any write into another repo ([C7 (pilots-untouched)](#c7)).
  - The sketch's other open questions, which stay open. This goal runs into only the front-end one.

## Architecture sketch

```text
storyboard turn [slug] [--json] [--done] [--accept]    shell: cli. Reads the env and stdin; passes the models in
   │  answers keyed by question id, the clock, the project dir and the slug
   ▼
flow: one turn                                         wiring
   ├─ store.load(.storyboard/<slug>/) ─► answers log ─► brief.replay ─► brief           core: brief
   ├─ intake: the three open questions, then models.classify (local) ─► kind, size
   ├─ models.interpret (frontier): the answers ─► slot updates
   ├─ turn(brief, event) ─► log entry, brief′, next                                    core: turn, scheduler
   │     next is one of: ask(lens, slots) · draft · playback(chunk) · accepted · no planner
   ├─ ask:    lens.load(lenses/<lens>/) + models.phrase (frontier) ─► one to four questions
   ├─ draft:  models.draft (frontier) ─► items ─► emit.keyframes ─► text               core: emit
   │          store.stage(draft/keyframes.md) ─► keyframes check --strict --json
   │          emit.chunks(text) ─► playback, each chunk ending "What's wrong or missing?"
   ├─ accept: store.accept ─► <project>/keyframes.md, refused if one is already there
   └─ store.append(entry), store.render(brief.md)
```

Every module above already has its zone in `fallow.toml` and its row in `docs/architecture.md`. A step that creates one keeps its row, and the page's "exist so far" line, true ([C2 (on-the-map)](#c2)).

## Decisions

- <a id="d1"></a>**D1 (interpreted-answers)**: The core never reads prose: before a turn, the models edge reads the person's words into slot updates, and the core decides what to ask while the model only phrases it, *because* the core can't call a model, and a scheduler that sees only slots stays plain code under tests.
- <a id="d2"></a>**D2 (draft-as-data)**: The frontier model drafts the Intent as prose and every other item as data (section, slug, text, because); the core emitter writes the markdown, *because* every draft is then in keyframes' usual form by construction, so `check`'s findings point at content, never at syntax.
- <a id="d3"></a>**D3 (staged-draft)**: A draft is staged at `.storyboard/<slug>/draft/keyframes.md` and checked there, and accepting copies it to the project root, *because* `keyframes check` reads a directory and takes nothing on stdin, and staging inside the session folder keeps [C4 (write-on-accept)](#c4).
- <a id="d4"></a>**D4 (clean-to-accept)**: Accepting needs a clean `keyframes check --strict`. A draft that fails goes back to the drafting model once with the findings, and whatever remains is shown in the playback, never hidden, and a refused accept always says why there, *because* the sketch wants every emitted plan clean under `check` and inside its budgets.
- <a id="d5"></a>**D5 (intent-sections)**: This goal's `keyframes.md` holds Intent, Principles, Constraints, Decisions, Taste, Questions and Ideas, with no Map, no Scenarios and no file pointers, *because* Map and Scenarios belong to the architecture and behavior lenses, which are later goals, and a staged draft can't resolve a pointer into the project.
- <a id="d6"></a>**D6 (frame-and-intent)**: Two lens folders land, `lenses/frame/` (intake's three questions first, then narrower follow-ups) and `lenses/intent/`, *because* keyframes' Intent prose comes from the frame slots, and `lenses/README.md` makes intake's questions the frame lens's first.
- <a id="d7"></a>**D7 (native-transports)**: The models edge builds one fascicle engine, with `ollama` for the local model and `anthropic` for the frontier, both on the native transport. The shell reads `STORYBOARD_LOCAL_MODEL`, `STORYBOARD_FRONTIER_MODEL`, `OLLAMA_HOST` and `ANTHROPIC_API_KEY` and stops with a message naming any that's missing, *because* native transports need no AI SDK peers, and the local model already differs between the sketch (qwen3.6:35b) and the pilots (qwen3.8:27b-32k), so its id is config, not code.
- <a id="d8"></a>**D8 (three-deps)**: Three runtime dependencies, each landing with its first use: `fascicle`, `zod` and `@robmclarty/keyframes`. keyframes joins checkride and fascicle in `pnpm-workspace.yaml`'s release-age exemption, and storyboard runs the `keyframes` bin from that dependency, never one found on PATH, *because* fascicle's `schema` takes zod, keyframes 0.3.0 was published on 2026-10-28 inside the 48-hour quarantine and is first-party like the other two, and the same draft must get the same verdict on every machine.
- <a id="d9"></a>**D9 (models-injected)**: The wiring and the CLI take the models edge as an argument: the bin passes the real one, tests pass a fake from `test/helpers/`, and the edge's own tests use `fascicle/testing`'s stub engine, *because* no test may reach a live model ([C1 (offline-gate)](#c1)), and one seam is cheaper than a mock per call.
- <a id="d10"></a>**D10 (one-turn-command)**: `storyboard turn` runs exactly one turn per call. The answers come in on stdin as JSON keyed by question id, and the next questions or the next playback chunk go out as text, or as JSON under `--json`. `--done` asks for the draft now, and `--accept` is the only path that writes outside `.storyboard/<slug>/`, *because* both front ends drive the same command, and a session moves between them by its files alone.
- <a id="d11"></a>**D11 (log-is-truth)**: `.storyboard/<slug>/answers.jsonl` gets one JSON line per turn, appended and never rewritten: what was asked, the answers word for word, and the slot updates the model read from them; `brief.md` is rendered from the log every turn and never parsed back, so a hand edit to it is overwritten and corrections go through answers, *because* only a log that carries what the model read from each answer replays without a model, which is what lets a session survive a crash and move between front ends.
- <a id="d12"></a>**D12 (slots-in-lenses)**: Each lens's `SKILL.md` lists its slots in a table (id, what it holds, impact, and the section it lands in); `src/lens.ts` reads it and checks it against a typed shape in the core, and a test that loads the real `lenses/` folder moves a typo's failure into `pnpm check`, *because* it keeps the seam `lenses/README.md` promises the design lens, a folder plus its emitter, and the load test catches most of what tsc would.
- <a id="d13"></a>**D13 (fixed-weights)**: Each slot declares an impact of 1 to 3; uncertainty is 1 for Missing, ½ for Partial and 0 for Clear; a slot is worth asking while impact × uncertainty is at least 1; ties break by lens order, then slot order, *because* it's the plain scheduler the sketch asks to prove first, and prerequisites are the cheap next step if the live redraft shows a bad order.
- <a id="d14"></a>**D14 (skill-first)**: Step 12 builds the Claude Code skill: `skills/storyboard/SKILL.md` over `storyboard turn --json`, with `AskUserQuestion` for the menus and each question relayed word for word; ACP in Zed follows on the same command, *because* it's the least to build and its menus already match the sketch's question shape.
- <a id="d15"></a>**D15 (redraft-keyframes)**: The live interview redrafts keyframes' own `keyframes.md`, Rob answering as its owner from memory and without storyboard reading the repo, into `~/Projects/storyboard/scratch/keyframes/`, which is outside every repo; step 13 compares the Intent and the P, C, D, T, Q and I items, *because* it's ready now, it's the only hand-written plan that keeps the run out of the pilots, and the sketch scores build order step 3 the same way, against a plan written by hand.
- <a id="d16"></a>**D16 (model-sets-status)**: `interpret` returns each slot's value and its status together, judged against the lens's "what makes it Clear" text, and the core applies both without judging; a slot's value is a list of short statements, usually one for a frame slot and several for an intent slot, *because* the log then carries the status, so replay needs no model and the scheduler stays plain code, and a correction can add or drop one statement without rewriting the rest.
- <a id="d17"></a>**D17 (intake-counts)**: Intake's three questions count against the frame lens's cap of five, *because* [D6 (frame-and-intent)](#d6) makes them its first questions and five is a ceiling on nagging, not a quota; both caps are arguments to the scheduler, so the flow raises the frame's if the live redraft shows it starved.
- <a id="d18"></a>**D18 (open-becomes-question)**: Every slot not Clear at draft time becomes a Question with its latest default, whatever left it open and whichever lens owns it; past keyframes' ten, the over-budget finding shows in the playback like any other, naming the count, and the person's corrections answer enough of them to bring it under, *because* prose can guess as easily as a Decision can, and a refusal nobody can see is a dead end.
- <a id="d19"></a>**D19 (corrections-as-entries)**: A correction in playback is its own log entry, keyed to the chunk and the items it names; `interpret` still updates the slots it touches, and the redraft call gets the previous draft and every correction verbatim, told to apply them and leave the rest alone; one redraft runs after the last chunk, the next playback shows only the chunks whose text changed, and a playback that ends with no corrections asks for `--accept`, *because* the person signs items, so the items they corrected must come back as corrected.
- <a id="d20"></a>**D20 (four-sizes)**: `classify` returns one of tiny, small, medium and large, and only tiny ends in "no planner needed" in this goal, *because* the sketch fixes only that a one-line fix gets no planner, and the lenses to come need the size recorded.

## Constraints

- <a id="c1"></a>**C1 (offline-gate)**: A step is done only when `pnpm check` exits 0 offline; no test calls a live model or reaches the network.
- <a id="c2"></a>**C2 (on-the-map)**: Build into the layout as it stands: `fallow.toml`'s zones, the door rules in `rules/` and `docs/architecture.md`. A new module gets its zone and its row in the same step, and a module that needs an effect its ring doesn't allow stops the build for a person ([`AGENTS.md`](../../../AGENTS.md)).
- <a id="c3"></a>**C3 (pure-core)**: `brief`, `scheduler`, `turn` and `emit` read only their arguments: the clock, ids and file contents come in as values (fallow's forbidden calls hold it).
- <a id="c4"></a>**C4 (write-on-accept)**: Nothing lands outside `.storyboard/<slug>/` until the person accepts, and accepting never overwrites a `keyframes.md` that's already there.
- <a id="c5"></a>**C5 (open-not-guessed)**: A slot still open at the cap becomes an open Question with its recommended default beside it, never a guessed Decision.
- <a id="c6"></a>**C6 (short-playback)**: Drafts play back in short chunks, each ending "What's wrong or missing?".
- <a id="c7"></a>**C7 (pilots-untouched)**: storyboard never runs in, drafts for or writes into the pilot repos (bbc, fascicle, atis, storium, volley, runciter, checkride and plumbbob), and never writes into any repo but this one. Depending on fascicle as a library is fine.
- <a id="c8"></a>**C8 (broad-then-narrow)**: Early questions are open, and intake's three have no menus. Later ones offer two to four options, a recommended answer and room for something else, and each bank question says which kind it is.
- <a id="c9"></a>**C9 (caps)**: At most four questions a round, and five per lens.

## Steps

1. [x] feat(brief): add the brief, its slot board and the answers log, **done when:** unit tests show that a slot definition reads into a typed slot ([D12 (slots-in-lenses)](#d12)); replaying an answers log gives the slot board, each slot Clear, Partial or Missing with its value, the times it was asked and its latest recommended default, and the same log always gives the same board; every log entry writes and reads back unchanged, and a malformed one is refused with its line number; `brief.md` renders byte-identical from the same board ([D11 (log-is-truth)](#d11)); and `pnpm check` exits 0
   - seam: `src/brief/`, `src/brief/__tests__/`, `docs/architecture.md`
   - model: opus (the record every later step builds on)
2. [ ] feat(scheduler): pick the next questions by impact × uncertainty, **done when:** table-driven tests show, scored per [D13 (fixed-weights)](#d13): the highest score is asked first, and ties break in a fixed order; a round asks about one lens, the one holding the top slot; no round holds more than four questions and no lens is asked past five ([C9 (caps)](#c9)), with both caps as arguments; it answers "draft" once no slot scores at the floor, or once the person has said done; a slot still open when it answers "draft" comes back as an open Question with its recommended default, never a Decision ([C5 (open-not-guessed)](#c5), [D18 (open-becomes-question)](#d18)); and `pnpm check` exits 0
   - seam: `src/scheduler.ts`, `src/__tests__/scheduler.test.ts`, `docs/architecture.md`
   - model: opus (strong-assertion test authoring)
3. [ ] feat(turn): run one pure turn from intake to accepted, **done when:** tests drive whole sessions with scripted events and no I/O, through intake, asking, drafting, playback and accepted; "done" in any asking turn goes straight to drafting; a drafted event carries its chunks, so the turn plays them back one at a time without knowing the emitter; a correction in playback is logged as its own entry and reopens the slots it touches, and after the last chunk the next draft plays back again ([D19 (corrections-as-entries)](#d19)); a tiny classification ends the session with "no planner needed"; every turn returns the log entry it adds, and replaying those entries gives the same brief and the same next action; and `pnpm check` exits 0
   - seam: `src/turn.ts`, `src/__tests__/turn.test.ts`, `docs/architecture.md`
   - model: opus (the state machine every front end leans on)
4. [ ] feat(keyframes): run keyframes check on a staged draft, **done when:** `@robmclarty/keyframes` is a dependency, exempt from the release-age quarantine ([D8 (three-deps)](#d8)), and in `fallow.toml`'s `ignoreDependencies` if fallow can't see a bin-only use; `src/keyframes.ts` runs `keyframes check --strict --json <dir>` from that dependency's bin and returns the exit code, the counts and the findings; tests run it on a clean plan and a broken one in `test/fixtures/` and get exit 0 and the expected findings, and a missing plan comes back as "no verdict", never as a pass; and `pnpm check` exits 0
   - seam: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `fallow.toml`, `src/keyframes.ts`, `src/__tests__/keyframes.test.ts`, `test/fixtures/plans/`, `docs/architecture.md`
   - model: sonnet (a subprocess wrapper, fully specified)
5. [ ] feat(emit): emit the keyframes draft and cut it for playback, **done when:** tests show the emitter writes a draft's Intent and its P, C, D, T, Q and I items in keyframes' usual form ([D2 (draft-as-data)](#d2), [D5 (intent-sections)](#d5)): IDs numbered from 1 in each section, unique lowercase slugs joined by hyphens, a `because:` on every Decision, and each open slot as a Question whose own text ends "Lean:" and its default, never as a sub-line, since keyframes has no `lean` key and an unknown key fails `--strict` ([C5 (open-not-guessed)](#c5), [D18 (open-becomes-question)](#d18)); an integration test runs the real `keyframes check --strict` through the edge on emitted fixtures and gets exit 0; the playback cutter returns chunks of at most one section and 30 lines, each ending "What's wrong or missing?" ([C6 (short-playback)](#c6)); and `pnpm check` exits 0
   - seam: `src/emit/`, `src/emit/__tests__/`, `test/integration/emit-check.test.ts`, `docs/architecture.md`
   - model: sonnet (keyframes' format page specifies the grammar, and its check verifies it)
6. [ ] feat(store): keep each interview's session files on disk, **done when:** tests in a temp directory show the store creates `.storyboard/<slug>/`, appends each log entry without rewriting the ones before it, renders `brief.md`, stages the draft at `draft/keyframes.md` ([D3 (staged-draft)](#d3)) and loads a session back to the same log; accepting copies the staged draft to the project's `keyframes.md` and refuses when one is already there ([C4 (write-on-accept)](#c4)); a listing of the temp directory after each call shows no other path; `docs/architecture.md`'s On disk lists the staged draft; and `pnpm check` exits 0
   - seam: `src/store.ts`, `src/__tests__/store.test.ts`, `docs/architecture.md`
   - model: sonnet (file I/O behind one door)
7. [ ] feat(lenses): write the frame and intent lenses and load them, **done when:** `lenses/frame/` and `lenses/intent/` each hold a `SKILL.md` (what the lens is for, the slots it owns per [D12 (slots-in-lenses)](#d12), what makes each slot Clear, and when the lens is the biggest gap), a `questions.md` (broad to narrow per [C8 (broad-then-narrow)](#c8), with intake's three questions first in frame, and a recommended answer on every question after them) and a `rubric.md` (what a good draft holds, and the generic defaults to steer away from), harvesting ridgeline's shaper (`~/Projects/ridgeline/code/ridgeline/src/agents/core/shaper.md`) and trellis's intake questions (`~/Projects/trellis/code/trellis/skills/run/references/intake-questions.md`) where they fit; `src/lens.ts` loads a lens folder into its slots, questions and rubric; a test loads the real `lenses/` folder and finds that every slot lands in a section the emitter writes and every question names a slot of its own lens; `lenses/README.md` names both folders; and `pnpm check` exits 0
   - seam: `lenses/frame/`, `lenses/intent/`, `lenses/README.md`, `src/lens.ts`, `src/__tests__/lens.test.ts`, `docs/architecture.md`
   - model: fable (question banks and a rubric are writing, in this repo's voice)
8. [ ] feat(models): reach the local and frontier models through fascicle, **done when:** `src/models/` builds one fascicle engine per [D7 (native-transports)](#d7) and offers four calls, each a `model_step` with its own system-prompt prefix and zod schema: `classify` (local: the intake answers into the work's kind, from the sketch's six, and its size, per [D20 (four-sizes)](#d20)), `interpret` (frontier: answers into slot updates with each slot's status, per [D1 (interpreted-answers)](#d1) and [D16 (model-sets-status)](#d16)), `phrase` (frontier: the scheduler's slots and their bank questions into one to four questions, per [C8 (broad-then-narrow)](#c8)) and `draft` (frontier: the brief, the rubric and any findings into items, per [D2 (draft-as-data)](#d2)); tests on `fascicle/testing`'s stub engine show each call reaches its model with its schema, and a reply that fails its schema is an error, never a guessed value; nothing reaches the network; and `pnpm check` exits 0
   - seam: `package.json`, `pnpm-lock.yaml`, `src/models/`, `src/models/__tests__/`, `cspell.json`, `docs/architecture.md`
   - model: opus (prompts and schemas at the one model door)
9. [ ] feat(flow): run intake and the asking turns through the models, **done when:** `src/intake.ts` returns intake's three questions from `lenses/frame/` and sends their answers to `classify`, and a tiny size ends with "no planner needed" (this goal uses the size only for that exit, and records the kind and size for the lenses to come); `src/flow.ts` runs one asking turn: load the session, `interpret` the answers, take the core turn, `phrase` the next round, then append and render; an integration test in a temp directory drives intake, the classification and two intent rounds with a fake models edge from `test/helpers/` ([D9 (models-injected)](#d9)), and replaying the stored log gives the same brief; and `pnpm check` exits 0
   - seam: `src/intake.ts`, `src/flow.ts`, `src/__tests__/`, `test/helpers/fake-models.ts`, `test/integration/asking.test.ts`, `docs/architecture.md`
   - model: opus (wiring the core to its edges)
10. [ ] feat(draft): draft, check and play back, then write on accept, **done when:** `src/draft.ts` drafts through `draft`, emits, stages and checks, and sends a failing draft back once with its findings ([D4 (clean-to-accept)](#d4)); the flow plays the draft back one chunk per turn, logs each correction and folds it into the brief, redrafts after the last chunk and plays back only the chunks that changed ([D19 (corrections-as-entries)](#d19)), and on accept writes the project's `keyframes.md` only when its check is clean; an integration test drives an interview from its last asking round to an accepted `keyframes.md` that passes `keyframes check --strict`, and shows a draft with errors refused at accept; and `pnpm check` exits 0
    - seam: `src/draft.ts`, `src/flow.ts`, `src/__tests__/`, `test/integration/drafting.test.ts`, `docs/architecture.md`
    - model: opus (the half of the loop the person signs)
11. [ ] feat(cli): run one interview turn from the command line, **done when:** `storyboard turn [slug] [--dir <project>] [--json] [--done] [--accept]` runs one turn per [D10 (one-turn-command)](#d10), its slug defaulting to the project directory's name; `run` becomes async and the bin awaits it; a refused accept exits 1, and a missing model setting exits 2 with a message naming it; the help, the README's status and `docs/architecture.md` describe the command; an e2e test drives a whole interview through `run` with a fake models edge, from the first call to an accepted `keyframes.md` in a temp directory, and replays the session; and `pnpm check` exits 0
    - seam: `src/cli.ts`, `src/__tests__/cli.test.ts`, `bin/storyboard.js`, `src/index.ts`, `test/e2e/interview.test.ts`, `README.md`, `docs/architecture.md`
    - model: sonnet (a thin shell over the flow, with step 9's fake)
12. [ ] feat(front): drive the first interview from the Claude Code skill, **done when:** per [D14 (skill-first)](#d14), `skills/storyboard/SKILL.md` drives `storyboard turn --json`, asking each round with `AskUserQuestion` and intake's open questions in plain chat, relaying every question word for word and never answering for the person, with a contract test in `test/contract/` pinning the JSON it reads; the README says how to start an interview from it; and `pnpm check` exits 0
    - seam: `skills/storyboard/SKILL.md`, `test/contract/`, `README.md`, `docs/architecture.md`
    - model: opus (the person-facing edge of the loop)
13. [ ] docs(research): record the keyframes redraft against the original, **done when:** `docs/research/keyframes-redraft.md` gives the questions the live interview asked, round by round, and sets the draft's items beside keyframes' hand-written Intent, Principles, Constraints, Decisions, Taste, Questions and Ideas, marking each matched, missed or added; it gives the two shares the sketch scores a split by (of the hand-written items, how many the draft also has; of the draft's items, how many the owner keeps) and what the misses suggest for the lenses; nothing is written outside this repo; and `pnpm check` exits 0
    - seam: `docs/research/keyframes-redraft.md`
    - model: opus (matching items by meaning)

## Build order

## Build ranges

Drive the build with `/plumbbob:run`, one range per run; each one stops where the call is yours.

1. `/plumbbob:build 1-3`, **stop:** review the core (the brief, its board and log, the scheduler and the turn) before anything touches a model
   - model: opus
   - note: [D11 (log-is-truth)](#d11), [D12 (slots-in-lenses)](#d12) and [D13 (fixed-weights)](#d13) settle the log, the slots and the score, which all three steps build on
2. `/plumbbob:build 4-7`, **stop:** review the lens content and the emitted `keyframes.md` before any model is prompted from them
   - model: fable
3. `/plumbbob:build 8-12`, **stop:** the live redraft, which only you can run: set the keys, wake the mini, and answer as keyframes' owner into the scratch directory ([D15 (redraft-keyframes)](#d15))
   - model: opus
   - note: the system prompts in `src/models/` are first drafts; the live run is what tunes them
4. `/plumbbob:build 13`, **stop:** at step 13's pause, approve the record's matched, missed and added calls, and which added items the owner keeps, before it lands
   - model: opus

## Open questions

None open. The ten this plan raised are settled in [D11 (log-is-truth)](#d11) to [D20 (four-sizes)](#d20).

## Verdicts

None yet.

## Source

The passages from [`docs/specs/initial_sketch.md`](../../../docs/specs/initial_sketch.md) at `c1e5c0f` that this goal builds from, copied as they stand.

### How it works, in part

- **The brief is the state.**
  - Every turn is one pure step: the brief and an answer go in, an updated brief and the next
    questions come out.
  - The brief lives in files: `.storyboard/<slug>/brief.md` and an answers log. So a turn can run
    from a CLI, from Zed over fascicle's ACP server, or from a Claude Code skill.
  - A session survives a crash, and fascicle's `suspend`, which replays from the start on every
    resume, is never needed.
- **Intake** asks at most three open questions, with no menus, because options steer:
  1. What is it, and who's it for?
  2. What would make it a success, and how much time is it worth?
  3. What must it never do?

  Then it classifies the work (product, feature, library, game, content, event) and its size,
  which decides the lenses and how much ceremony to use. A one-line fix gets no planner.
- **The scheduler** marks every slot Clear, Partial or Missing, and asks next about the one with
  the highest impact × uncertainty, as Spec Kit's `/clarify` does.
- **Broad, then narrow.** Early questions are open. Later ones offer two to four options, with a
  recommended answer and "something else". Design questions carry previews.
- **Stopping.**
  - At most four questions a round, and about five per lens.
  - It stops and drafts when the person says "done", or when no question is worth its cost.
  - A slot still open at the cap becomes an open Question, with the recommended default beside
    it. It never becomes a guessed Decision; that's plumbbob's hard contract.
- **Playback.** Drafts come back in short chunks, each ending "what's wrong or missing?", so the
  person reviews a page at a time, not 2,500 lines.

### The slots, in part

| Lens | Slots | Lands in |
| --- | --- | --- |
| Frame | Problem, who it's for, appetite, no-gos, what done looks like, prior art and existing code | Intent prose; no-gos become Constraints |
| Intent | Principles, constraints, decisions (options considered, and why), taste, open questions, ideas | `keyframes.md`: P, C, D, T, Q, I |

### Where it lives, in part

- **Local-first.**
  - The local model (qwen3.6:35b on the mini) classifies intake and samples drafts.
  - The frontier model asks and drafts.
  - No telemetry.

### When, in part

keyframes' I6 says the drafting interview waits until after the pilots, because a drafted plan
would muddy H1: can an owner write a plan from the template alone? So run the pilots with plans
written by hand, and build storyboard after the closing call. If it's built sooner, keep it out
of the pilot repos.

### Build order, steps 1 and 2

1. The brief's schema and the slot board, with the scheduler as plain code under tests.
2. Intake, the intent lens and the keyframes emitter, checked by `keyframes check`. Test it by
   redrafting one pilot repo's plan and comparing the two.
