<!--
build-log.md: your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md; you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /plumbbob:finish report, which rides the branch into the PR.
-->

# Build log: The core and the first interview

**Current step:** 12 — feat(front): drive the first interview from the Claude Code skill
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. feat(brief): add the brief, its slot board and the answers log
- ☑ 2. feat(scheduler): pick the next questions by impact × uncertainty
- ☑ 3. feat(turn): run one pure turn from intake to accepted
- ☑ 4. feat(keyframes): run keyframes check on a staged draft
- ☑ 5. feat(emit): emit the keyframes draft and cut it for playback
- ☑ 6. feat(store): keep each interview's session files on disk
- ☑ 7. feat(lenses): write the frame and intent lenses and load them
- ☑ 8. feat(models): reach the local and frontier models through fascicle
- ☑ 9. feat(flow): run intake and the asking turns through the models
- ☑ 10. feat(draft): draft, check and play back, then write on accept
- ☑ 11. feat(cli): run one interview turn from the command line
- ☐ 12. feat(front): drive the first interview from the Claude Code skill
- ☐ 13. docs(research): record the keyframes redraft against the original
- ☑ 14. feat(brief): stamp each log entry with the call that wrote it

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] Stamp each answers.jsonl entry with the number of the storyboard turn call that wrote it, so the log stays one line per event but groups into one exchange per call (the range 1 stop's call on D11)
- [x] Tell the draft model keyframes' budgets (60 words an item, 7 principles, 12 constraints, 20 decisions, 12 taste, 10 open questions, 10 ideas, 2000 words), since over-budget fails --strict and the emitter doesn't trim

## Harvest  *(run `/plumbbob:harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                               |
| ---------------- | ----------------------------------------- | ------------------------------------ |
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/plumbbob:revert`, fold into intent |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.         |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.           |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- 2026-10-28, at range 1 of 4's stop: 1 parked idea, classified.
- **blocker**: park 1 · Stamp each answers.jsonl entry with the number of the storyboard turn call that wrote it, so the log stays one line per event but groups into one exchange per call (the range 1 stop's call on D11) → D11 as landed is bent, and the log format must settle before the store and the flow write it
- 2026-10-29, at the step 5 boundary: 1 parked idea, classified.
- **tangent**: park 2 · Tell the draft model keyframes' budgets (60 words an item, 7 principles, 12 constraints, 20 decisions, 12 taste, 10 open questions, 10 ideas, 2000 words), since over-budget fails --strict and the emitter doesn't trim → the plan isn't wrong, since step 7's rubric or step 8's draft prompt can carry the budgets inside their own seams

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends an entry here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`): the dated line,
and beneath it the pause as you approved it, so this fills in as you go, not at the
end, and an older step's detail is a scroll away. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-10-28 — step 1 checkpointed · a960a56fa — feat(brief): add the brief, its slot board and the answers log (9m)

  **Summary**: `src/brief/` is the record every later step builds on. It reads a lens table's row into a typed slot, reads and writes the answers log one validated JSON line per entry, replays the log into the slot board, and renders `brief.md` from that board. 101 unit tests cover it.

  1. The log has one line per turn of the core, and its vocabulary covers the whole session
  2. The reader is stricter than the plan spells out
  3. Replay also refuses what the brief so far rules out

  **Readout**:

  ```text
  check        green: 10 of 10 checks
  done-when    met
  decisions    5 of 5 honored
  constraints  9 of 9 honored
  seam         held: 3 of 3 declared, no strays
  diff         +1213 -4 across 12 files
               - docs/architecture.md +6 -4
               - src/brief/__tests__/board.test.ts +157 -0
               - src/brief/__tests__/fixture.ts +86 -0
               - src/brief/__tests__/log.test.ts +163 -0
               - src/brief/__tests__/render.test.ts +92 -0
               - src/brief/__tests__/slot.test.ts +80 -0
               - src/brief/board.ts +149 -0
               - and 5 more
  spent        9 min · 2s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Land it and go on to step 2. The scheduler reads the board's statuses, asks and per-lens questions just as they stand now.

  **1.** The log has one line per turn of the core, and its vocabulary covers the whole session

  An entry is one event: `asked`, `answered`, `classified`, `done`, `drafted`, `passed`, `corrected` or `accepted`. Replay is a fold over those events. I put the draft and playback kinds in now because step 3's turn needs them and its seam doesn't reach `src/brief/`. So a CLI call that takes answers and then asks the next round appends two lines (`answered`, then `asked`), not one. That's my reading of "one JSON line per turn" in [D11 (log-is-truth)](intent.md#d11), where a turn is the core's, and it means answers are on disk before the next model call can fail. The range's stop is where this gets reviewed.

  **2.** The reader is stricter than the plan spells out

  A Missing slot has no statements and a Clear or Partial slot has at least one. A menu has two to four options, an `asked` entry holds one to four questions ([C9 (caps)](intent.md#c9)), and no entry can name the same question or slot twice. A field the log doesn't expect is refused, not dropped, so a line always writes back byte for byte. `writeEntry` runs the same reader, so nothing malformed gets written.

  **3.** Replay also refuses what the brief so far rules out

  Replay refuses an answer to a question nobody asked, an update or question naming a slot no lens has, a question asked twice, and a question spanning two lenses. Each refusal names its line. The last one keeps each lens's question count well defined for the cap in step 2.

- 2026-10-28 — step 2 checkpointed · eb19e785f — feat(scheduler): pick the next questions by impact × uncertainty (2m)

  **Summary**: `src/scheduler.ts` picks the next round or says it's time to draft. A slot's score is its impact times its uncertainty, a slot is worth asking while that's at least 1, and a round asks the lens holding the top slot, up to four questions and five per lens, with both caps passed in. On "draft" it returns every slot that isn't Clear as an open Question with its latest default. 33 table-driven tests cover it.

  1. A lens at its cap is passed over, and the top slot is taken from the lenses left
  2. A round names slots, one question each, so phrasing can't break the caps
  3. Every open slot becomes a Question at the draft, even one below the floor
  4. I fixed step 1's links in the build log

  **Readout**:

  ```text
  check        green: 10 of 10 checks
  done-when    met
  decisions    3 of 3 honored
  constraints  9 of 9 honored
  seam         held: 3 of 3 declared, no strays
  diff         +342 -1 across 3 files
               - docs/architecture.md +1 -1
               - src/__tests__/scheduler.test.ts +250 -0
               - src/scheduler.ts +91 -0
  spent        2 min · 2s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Land it and go on to step 3. The turn calls `schedule` with the board and the done flag, and passes `CAPS` unless the flow changes them.

  **1.** A lens at its cap is passed over, and the top slot is taken from the lenses left

  "The one holding the top slot" counts only lenses with room under their cap. When the best slot's lens has had its five questions, the round goes to the best slot in another lens, and once every slot worth asking is in a capped lens, the scheduler answers "draft". That's how C9 (caps) and C5 (open-not-guessed) meet: a slot open at the cap is drafted as a Question, never asked a sixth time. A round's size is the smallest of the round cap, the lens's room and its slots worth asking.

  **2.** A round names slots, one question each, so phrasing can't break the caps

  The round returns slot ids in score order. The contract for phrasing is at most one question per slot, so a round of four slots can't become five questions. Each question counts once against its lens, however many slots it names, which is how intake's three questions use up three of the frame lens's five (D17 (intake-counts)).

  **3.** Every open slot becomes a Question at the draft, even one below the floor

  D18 (open-becomes-question) says every slot not Clear at draft time becomes a Question, so the open list includes a Partial slot of impact 1, which was never worth asking. Each open Question carries `section: 'questions'` whatever its slot lands in, so a slot bound for Decisions can't come back as a guessed Decision. The list keeps the board's order.

  **4.** I fixed step 1's links in the build log

  Step 1's detail linked to `intent.md` relative to `.plumbbob/`, and the checkpoint moved that text into the build log, so `links` failed. I pointed those two links at `intent.md`, and from now on the detail file cites decisions by slug without links. This step's commit includes that build-log change, outside the seam.

- 2026-10-28 — step 3 checkpointed · 7759c48c1 — feat(turn): run one pure turn from intake to accepted (1 drift, 4m)

  **Summary**: `src/turn.ts` runs the interview as a pure state machine. A turn takes the session and one event and returns the log entry it adds and the session after it, whose next step is one of intake, answer, classify, ask, draft, play, accept, accepted or no planner. `resume` rebuilds a session by taking each log entry as the turn that wrote it, so the same entries give the same brief and the same next step. 45 tests drive whole sessions with scripted events and no I/O.

  1. A few protocol calls the plan leaves open are made here, for the stop to review
  2. "Reopens the slots it touches" works through the model's updates, not the core
  3. The turn checks what the flow hands it, so the caps hold whatever a model returns
  4. Two small edits outside the seam

  **Readout**:

  ```text
  check        green: 10 of 10 checks
  done-when    met
  decisions    5 of 5 honored
  constraints  9 of 9 honored
  seam         strayed: 3 paths outside the seam
               - src/__tests__/scheduler.test.ts
               - src/brief/index.ts
               - src/scheduler.ts
  diff         +691 -8 across 6 files
               - docs/architecture.md +2 -2
               - src/__tests__/scheduler.test.ts +4 -4
               - src/__tests__/turn.test.ts +374 -0
               - src/brief/index.ts +1 -0
               - src/scheduler.ts +2 -2
               - src/turn.ts +308 -0
  spent        4 min · 5s gate · green first run
  ```

  **Verdict**: ◐ A hair off (seam strayed)

  **Recommendation**: Land it, and with it the range. The stop card then reviews the core as a whole.

  **1.** A few protocol calls the plan leaves open are made here, for the stop to review

  A round closes on its first answer, and any question left unanswered drops. The scheduler can ask about that slot again, and the new question counts against the lens's cap. "Done" is taken in an asking turn, so it's refused during intake, before the work is classified, because a tiny check can't be skipped. A correction is also taken at the accept: it's keyed to the last chunk played and sends the draft back, which gives a refused accept a way forward (D4 (clean-to-accept), D18 (open-becomes-question)). A redraft that changes no chunk plays back whole, not empty.

  **2.** "Reopens the slots it touches" works through the model's updates, not the core

  D16 (model-sets-status) has the core apply each status without judging it, so a correction reopens a slot only when `interpret` reads it as Partial or Missing. The test does exactly that, taking `decisions` from Clear to Partial. A redraft gets the draft it replaces and the corrections made on it, word for word. I read "every correction" in D19 (corrections-as-entries) as every correction on that draft, since earlier ones are already in it.

  **3.** The turn checks what the flow hands it, so the caps hold whatever a model returns

  A phrased round may ask only about the slots the scheduler picked, one question a slot, so it can't exceed C9 (caps). Intake's questions must be open, at most three, and about the first lens (C8 (broad-then-narrow)). Every entry the turn returns has been written and read back through the log's codec, so it's exactly the line the store will append. `resume` refuses an entry that couldn't have come when it did, naming its line.

  **4.** Two small edits outside the seam

  `src/brief/index.ts` now re-exports `Read`. I renamed the scheduler's result type from `Next` to `Scheduled`, because fallow refuses two exports with one name.

- 2026-10-28 — range 1 of 4's stop recorded — review the core (the brief, its board and log, the scheduler and the turn) before anything touches a model

  **Summary**: The pure core is in, with 179 new unit tests and no I/O. `src/brief/` reads a lens table's row into a typed slot, keeps the answers log as validated JSON lines, replays it into the slot board and renders `brief.md`. `src/scheduler.ts` picks each round by impact × uncertainty under the caps and hands back every open slot as a Question at the draft. `src/turn.ts` runs the interview as a state machine from intake to accepted, and `resume` gives back the same brief and next step from the log alone.

  1. Step 3 landed a hair off its seam, with two small edits to earlier steps' files
  2. The log keeps one line per event, and each line will carry the call that wrote it
  3. The turn makes five protocol calls the plan leaves open
  4. The core holds the caps and the open-question contract whatever a model returns

  **Readout**:

  ```text
  steps        3 of 3 landed
               - 1 a960a56 · 2 eb19e78 · 3 7759c48
  check        green: 10 of 10 checks, 3 landings
  done-when    met
  decisions    bent: D11 (log-is-truth) reads "a turn" as the core's
               → your call: keep events, stamp each with its call; P1
  constraints  9 of 9 honored
  seam         strayed: 3 paths outside step 3's seam
               - src/__tests__/scheduler.test.ts
               - src/brief/index.ts
               - src/scheduler.ts
  diff         +2246 -13 across 16 files
               - docs/architecture.md +9 -7
               - src/__tests__/scheduler.test.ts +254 -4
               - src/__tests__/turn.test.ts +374 -0
               - src/brief/__tests__/board.test.ts +157 -0
               - src/brief/__tests__/fixture.ts +86 -0
               - src/brief/__tests__/log.test.ts +163 -0
               - src/brief/__tests__/render.test.ts +92 -0
               - and 9 more
  spent        19 min · green first run at every landing · 1 drift warning
  ```

  **Verdict**: ○ Out of plumb (decisions bent)

  **Harvested**: 1 of 1 parked idea open

  | Park | What it is | Why it matters | Lean |
  | --- | --- | --- | --- |
  | P1 · Stamp entries with their call | Stamp each answers.jsonl entry with the number of the storyboard turn call that wrote it, so the log stays one line per event but groups into one exchange per call (the range 1 stop's call on D11) | the log reads as one exchange per call, and D11 holds again | blocker: D11 as landed is bent, and the log format must settle before the store and the flow write it |

  **Recommendation**: Approve the review and fold P1 as a blocker: amend D11 (log-is-truth) to one line per event, each stamped with its call, and add step 14 at the head of range 2. Steps 6 and 9 are the first to write the log, so stamping it first means nothing on disk ever lacks the field.

  **1.** Step 3 landed a hair off its seam, with two small edits to earlier steps' files

  The turn needed `Read` from `src/brief/index.ts`, so that barrel gained one re-export. fallow refuses two exports with one name, so the scheduler's result type was renamed from `Next` to `Scheduled`, with its test following. Neither changes behavior. Step 2 also carried a fix to the build log: step 1's detail had links relative to `.plumbbob/` that broke once the checkpoint moved them into the log.

  **2.** The log keeps one line per event, and each line will carry the call that wrote it

  Every entry is one event: `asked`, `answered`, `classified`, `done`, `drafted`, `passed`, `corrected` or `accepted`. The turn takes one event and returns the one entry it adds, so a `storyboard turn` call that takes answers and phrases the next round appends two or three lines, where D11 (log-is-truth) and D10 (one-turn-command) read as one line per call. Your call at this stop keeps event lines, since they put each answer and its reading on disk before the next model call can fail, and stamps every entry with the number of the call that wrote it, so the log still groups into one exchange per call. That lands as P1, below: D11 amended to say so, and a new step 14 built first in range 2, before the store or the flow writes a line.

  **3.** The turn makes five protocol calls the plan leaves open

  A round closes on its first answer. A question left unanswered drops, and the scheduler can ask about its slot again against the cap. "Done" is refused during intake, so a tiny classification can't be skipped. A correction is taken at the accept, keyed to the last chunk played, so a refused accept (D4 (clean-to-accept)) has a way forward. A redraft that changes no chunk plays back whole. And a redraft gets the corrections made on the draft it replaces, which is my reading of "every correction" in D19 (corrections-as-entries).

  **4.** The core holds the caps and the open-question contract whatever a model returns

  The scheduler gives a lens at its cap no more questions and passes the round to the next lens. It answers "draft" once every slot worth asking is capped, and returns every slot that isn't Clear as an open Question, including one below the floor (D18 (open-becomes-question)). The turn refuses a phrased round that asks about a slot the scheduler didn't pick, or asks one slot twice, so phrasing can't break C9 (caps). It also refuses intake questions with a menu (C8 (broad-then-narrow)). A correction reopens a slot only through `interpret`'s update, because D16 (model-sets-status) has the core apply each status without judging it.

- 2026-10-28 — step 14 checkpointed · 159a9ab93 — feat(brief): stamp each log entry with the call that wrote it (1 drift, 3m)

  **Summary**: Every line of the answers log now carries `call`, the number of the `storyboard turn` call that wrote it, counting from 1. The codec refuses a call that isn't a whole number from 1 and names its line. `turn` takes the call with the time as one stamp, and the session gives the last call. The turn and `resume` both refuse a call that steps back or skips one. Grouped by call, a whole test session gives one exchange per call.

  1. The call and the time travel together as the entry's stamp
  2. The core checks the order of calls, not where a call should end
  3. The session test numbers calls the way the flow will
  4. One line outside the seam, and one message reworded

  **Readout**:

  ```text
  check        green: 10 of 10 checks
  done-when    met
  decisions    2 of 2 honored
  constraints  9 of 9 honored
  seam         strayed: 1 path outside the seam
               → src/__tests__/scheduler.test.ts
  diff         +253 -120 across 10 files
               - docs/architecture.md +4 -2
               - src/__tests__/scheduler.test.ts +1 -0
               - src/__tests__/turn.test.ts +90 -8
               - src/brief/__tests__/board.test.ts +8 -5
               - src/brief/__tests__/fixture.ts +11 -6
               - src/brief/__tests__/log.test.ts +39 -24
               - src/brief/__tests__/render.test.ts +2 -1
               - and 3 more
  spent        3 min · 2s gate · green first run
  ```

  **Verdict**: ◐ A hair off (seam strayed)

  **Recommendation**: Land it and go on to step 4. Steps 6 and 9 are the first to write the log, so every line they write will carry its call from the start.

  **1.** The call and the time travel together as the entry's stamp

  `Stamp` is `{ call, at }`, and `Entry` is a stamp joined to the event's own fields, so every kind carries both and the codec reads them in one place. A line is written `kind`, `call`, `at`, then the event's fields. `turn(session, event, stamp)` replaces the bare time it took before. `session.call` is the call that wrote the last entry, or 0 before any, so the flow's next call is one more.

  **2.** The core checks the order of calls, not where a call should end

  An entry's call must be the session's last or the one after it. The check runs in the step that both `turn` and `resume` share, so a live turn and a replayed log refuse the same entries, and `resume` names the line. The core doesn't require a call to end on something for the person. If a model call fails after the answers are written, the next call picks up where it stopped, and that is the reason for one line per event (D11 (log-is-truth)).

  **3.** The session test numbers calls the way the flow will

  The test helper starts a new call each time the session hands back to the person (questions, a chunk, the accept, or the end) and keeps the call while the flow carries on. Grouped by call, the whole session gives nine exchanges: intake's questions; the answers, the classification and the next round; and so on down to the accept. Each exchange ends on what the person sees next. Separate tests cover a turn taking the last call or the next one, and refusing one before the last or past the next, including a first entry from call 2.

  **4.** One line outside the seam, and one message reworded

  `src/__tests__/scheduler.test.ts` builds an asked entry by hand, so it gained `call: 1`, because the type requires it. The call and the chunk index now share one reader, so a bad chunk reads "isn't a whole number from 0".

- 2026-10-28 — step 4 checkpointed · ebc5512f8 — feat(keyframes): run keyframes check on a staged draft (3m)

  **Summary**: `src/keyframes.ts` runs `keyframes check --strict --json` on a folder's plan with the bin from storyboard's own `@robmclarty/keyframes` 0.3.0, and gives back the exit code, the error, warning and note counts, and the findings. A missing plan, a run that doesn't finish and a report that doesn't read all come back as "no verdict", never a pass. Tests run the real bin on a clean plan, a broken one and a folder with no plan, and table-test the verdict reader.

  1. The bin comes from the dependency's own manifest, so fallow sees the use
  2. A report is believed only when its exit code agrees with its counts
  3. "The counts" are the error, warning and note counts
  4. The broken fixture shows why step 5 puts "Lean:" in the Question's own text

  **Readout**:

  ```text
  check        green: 10 of 10 checks
  done-when    met
  decisions    3 of 3 honored
  constraints  9 of 9 honored
  seam         held: 7 of 8 declared, no strays
  diff         +267 -4 across 9 files
               - docs/architecture.md +2 -2
               - package.json +3 -0
               - pnpm-lock.yaml +11 -0
               - pnpm-workspace.yaml +3 -2
               - src/__tests__/keyframes.test.ts +71 -0
               - src/keyframes.ts +127 -0
               - test/fixtures/plans/broken/keyframes.md +15 -0
               - and 2 more
  spent        3 min · 2s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Land it and go on to step 5. The emitter's integration test can call `check` on what it emits as soon as its fixtures exist.

  **1.** The bin comes from the dependency's own manifest, so fallow sees the use

  The edge imports `@robmclarty/keyframes/package.json`, resolves its `bin.keyframes` beside it, and runs it with the same `node` that runs storyboard. Nothing comes from PATH (D8 (three-deps)). Because the import is static, fallow counts the dependency as used, so `fallow.toml`'s `ignoreDependencies` didn't need it. The package joins checkride and fascicle in the release-age exemption, and it has no dependencies of its own.

  **2.** A report is believed only when its exit code agrees with its counts

  Exit 0 or 1 must come with a report that parses, is schema version 1, has whole-number counts and findings that read. Under `--strict`, exit 0 must mean no errors and no warnings, and exit 1 must mean some. Anything else is no verdict, with the reason: exit 2's own message (such as "there's no keyframes.md to check"), a stopped run, or a report that doesn't read. The flow can then refuse an accept on anything but a clean verdict (D4 (clean-to-accept)). The folder path is made absolute before it's passed, so it can never be read as a flag.

  **3.** "The counts" are the error, warning and note counts

  The verdict carries `errors`, `warnings` and `notes`, the counts the accept and the playback need. It leaves out the per-section counts and the items in the JSON report. Step 10 can add them if the playback wants them.

  **4.** The broken fixture shows why step 5 puts "Lean:" in the Question's own text

  The broken plan's five findings include `unknown-key` for a `lean:` sub-line, which fails `--strict`. The clean plan keeps its lean inside its Question's text and passes.

- 2026-10-29 — step 5 checkpointed · e5bf98718 — feat(emit): emit the keyframes draft and cut it for playback (829m)

  **Summary**: `src/emit/` writes a draft as `keyframes.md` in keyframes' usual form, and cuts it into playback chunks. The draft is the project's name, the Intent as prose, items as data, and every open slot. Each chunk holds at most one section and 30 lines and ends "What's wrong or missing?". The real `keyframes check --strict`, run through step 4's edge, passes every emitted fixture with nothing found. The run stopped at this pause because the run's grant ended with the earlier turn, so steps 6 and 7 wait for you to type `/plumbbob:run` again.

  1. The emitter makes the form right by construction, and refuses only what it can't invent
  2. An open slot with no default asks without "Lean:"
  3. Lines wrap at 100 columns, so the 30-line chunks measure something
  4. The cutter splits a long section between items, and repeats its heading
  5. Budgets stay keyframes' to enforce, and I parked a note for step 8

  **Readout**:

  ```text
  check        green: 10 of 10 checks
  done-when    met
  decisions    3 of 3 honored
  constraints  9 of 9 honored
  seam         held: 4 of 4 declared, no strays
  diff         +618 -2 across 9 files
               - docs/architecture.md +2 -2
               - src/emit/__tests__/keyframes.test.ts +165 -0
               - src/emit/__tests__/playback.test.ts +91 -0
               - src/emit/__tests__/wrap.test.ts +33 -0
               - src/emit/index.ts +3 -0
               - src/emit/keyframes.ts +135 -0
               - src/emit/playback.ts +69 -0
               - and 2 more
  spent        13h 49m · 2 turns · 4s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Land it, then type `/plumbbob:run` to carry range 2 through steps 6 and 7. The emitter and cutter meet the done-when, and keyframes' own check passes what they write. The no-default Questions (section 2) and the 100-column wrap (section 3) are the two calls worth a look at the range's stop.

  **1.** The emitter makes the form right by construction, and refuses only what it can't invent

  IDs count from 1 in each section. A slug is lowercased, accents dropped, and joined by hyphens, and it gets `-2`, `-3` when another item in the plan already has it. A slug with nothing left, like `!!!`, is named for its section. What it can't make up, it refuses with a reason: a draft with no name or Intent, an item with no text, or a Decision with no `because:` (D2 (draft-as-data)). It writes no Map, no Scenarios and no pointers, and leaves out a section with no items (D5 (intent-sections)).

  **2.** An open slot with no default asks without "Lean:"

  Each open slot comes last among the Questions, with "Lean:" and its default at the end of its own text, never as a sub-line (D18 (open-becomes-question)). A slot that no question recommended a default for has nothing to lean to, so its Question ends at the question. That's my reading of "ends 'Lean:' and its default". The other way is to have the drafting model propose a lean, which step 10 could still do.

  **3.** Lines wrap at 100 columns, so the 30-line chunks measure something

  This wasn't asked for. A model writes each paragraph as one long line, and 30 such lines would be pages. So the Intent's paragraphs, each item's text and each `because:` wrap the way a hand-written plan does, under the indent keyframes reads as a continuation. A word that markdown would read as a bullet, heading, numbered item or quote never starts a line, so wrapping can't open a sub-line or end an item. The Intent keeps its paragraphs, and a leading `#` is escaped so it stays prose.

  **4.** The cutter splits a long section between items, and repeats its heading

  A section too long for one chunk goes over several, each under the section's heading. Cuts fall only between items or paragraphs, so a Decision stays with its `because:`. The title rides with the first chunk. Put back together, the chunks hold every line of the draft once, in order, and still check clean.

  **5.** Budgets stay keyframes' to enforce, and I parked a note for step 8

  The integration fixture first failed on `over-budget`: an item over 60 words fails `--strict`. That's about content, and D18 (open-becomes-question) has the playback show it, so the emitter doesn't trim. I parked P2 to give the draft model keyframes' budgets in its prompt.

- 2026-10-29 — step 6 checkpointed · e711f3ddd — feat(store): keep each interview's session files on disk (2m)
- 2026-10-29 — step 7 checkpointed · 4d14778b2 — feat(lenses): write the frame and intent lenses and load them (13m)
- 2026-10-30 — range 2 of 4's stop recorded — review the lens content and the emitted `keyframes.md` before any model is prompted from them

  **Summary**: Range 2 puts the edges and the lens content around the core, and still prompts no model. Every log line now carries the call that wrote it (step 14). `src/keyframes.ts` runs keyframes' own `check --strict` on a staged draft (step 4). `src/emit/` writes a draft as `keyframes.md` in keyframes' usual form and cuts it into playback chunks, and keyframes' check passes everything it writes (step 5). `src/store.ts` writes the session's own files and nothing else until accept (step 6). `lenses/frame/` and `lenses/intent/` hold the slots, question banks and rubrics that `src/lens.ts` loads and checks (step 7).

  1. Step 14 landed a hair off its seam, with one test line outside it
  2. The intent lens asks before the frame's follow-ups, which is D13 working as written
  3. Every question after intake recommends an answer, and seven of them are open
  4. An emitted keyframes.md reads like a hand-written one, and keyframes' check passes it
  5. The store writes only the session's own files, and refuses rather than creates

  **Readout**:

  ```text
  steps        5 of 5 landed
               - 14 159a9ab · 4 ebc5512 · 5 e5bf987 · 6 e711f3d · 7 4d14778
  check        green: 10 of 10 checks, 5 landings
  done-when    met
  decisions    honored
               - D2 (draft-as-data)
               - D3 (staged-draft)
               - D5 (intent-sections)
               - D6 (frame-and-intent)
               - D8 (three-deps)
               - D11 (log-is-truth)
               - D12 (slots-in-lenses)
               - D16 (model-sets-status)
               - D18 (open-becomes-question)
  constraints  9 of 9 honored
  seam         strayed: 1 path outside step 14's seam
               → src/__tests__/scheduler.test.ts
  diff         +2805 -139 across 37 files
               - docs/architecture.md +16 -10
               - lenses/README.md +58 -9
               - lenses/frame/SKILL.md +56 -0
               - lenses/frame/questions.md +127 -0
               - lenses/frame/rubric.md +39 -0
               - lenses/intent/SKILL.md +53 -0
               - lenses/intent/questions.md +99 -0
               - and 30 more
  spent        14h 14m · green first run at every landing · 1 drift warning
  ```

  **Verdict**: ◐ A hair off (seam strayed)

  **Recommendation**: Approve the review as it stands, keeping the intent-first order (section 2) and the seven open follow-ups (section 3). Both are content or scheduling calls that cost little to change, and the live redraft at range 3's stop is the first real evidence on either. Read the two `questions.md` files before you type the next run, since step 8's prompts are built from them and a wording is cheapest to change now.

  **1.** Step 14 landed a hair off its seam, with one test line outside it

  `src/__tests__/scheduler.test.ts` builds an asked entry by hand, so it gained `call: 1`, which the type now requires. The call and the chunk index also share one reader now, so a bad chunk's message reads "isn't a whole number from 0". Neither changes behavior. Steps 4 to 7 held their seams. Step 7's first gate run failed on lint, for two helpers that belonged at the module's top level, and went green once they moved.

  **2.** The intent lens asks before the frame's follow-ups, which is D13 working as written

  The lenses give each slot an impact from 1 to 3, and D13 (fixed-weights) counts a Partial slot at half of it. Intake usually leaves the frame's slots Partial, so an impact-3 frame slot scores 1.5. An intent slot nobody has asked about scores its full impact, which is 3 for principles and decisions. So the first round after intake goes to the intent lens: principles, decisions, constraints and taste. The next round gives intent its fifth question, and only then do the frame's two remaining questions go to its vaguest slots. `lenses/frame/SKILL.md` says so plainly.

  If you'd rather the frame finish first, the cheap fix D13 names is a prerequisite: the intent lens waits until the frame's impact-3 slots are at least Partial. That's a scheduler change, not a lens edit. I'd leave it until the live redraft shows whether the order hurts.

  **3.** Every question after intake recommends an answer, and seven of them are open

  The banks hold intake's three and 23 follow-ups: 16 menus and 7 open questions. The open ones are where a short list of options would steer: what people do today, what's already decided, what it should never feel like, and what's for later. Each one still recommends an answer, as the done-when asks. My reading of C8 (broad-then-narrow) is that "early questions are open" covers a slot's first, broad question, and "each bank question says which kind it is" allows both kinds after intake. If you read C8 as menus only after intake, the seven become menus, a content edit in `questions.md` and nothing else.

  A recommendation is a seed the phrase step adapts. On a question about the person's world, it's the likeliest answer, for them to confirm. On a call, it's the safest default, the one that commits the plan to the least, such as "None beyond the no-gos" or "Nothing is settled yet". The intent rubric also carries keyframes' budgets, which were park 2.

  **4.** An emitted keyframes.md reads like a hand-written one, and keyframes' check passes it

  For this card I wrote a small draft by hand and ran it through the built emitter. The real `keyframes check --strict` reports nothing on it, and it cuts into 7 playback chunks:

  ```markdown
  # inkwell
  ```

  **5.** The store writes only the session's own files, and refuses rather than creates

  The store's tests list the temp project after every call, and nothing appears but `.storyboard/<slug>/` and, on accept, `keyframes.md`. Loading a new session writes nothing. A project folder that isn't there is refused rather than created, and so is a slug with a slash or `..`. Accepting copies with an exclusive create, so it can't write over a `keyframes.md`, even one that appeared since the draft was checked. The slug check is otherwise loose: any one name, spaces and capitals included, so step 11's default from the project folder's name works whatever the folder is called.

- 2026-10-30 — step 8 checkpointed · 2a6042b7c — feat(models): reach the local and frontier models through fascicle (9m)
- 2026-10-30 — step 9 checkpointed · efd6be9f5 — feat(flow): run intake and the asking turns through the models (5m)
- 2026-10-30 — step 10 checkpointed · d3b3606ab — feat(draft): draft, check and play back, then write on accept (1 drift, 6m)
- 2026-10-30 — step 11 checkpointed · 8149f04b6 — feat(cli): run one interview turn from the command line (3m)
