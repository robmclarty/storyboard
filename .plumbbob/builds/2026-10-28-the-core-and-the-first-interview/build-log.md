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

**Current step:** 3 — feat(turn): run one pure turn from intake to accepted
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. feat(brief): add the brief, its slot board and the answers log
- ☑ 2. feat(scheduler): pick the next questions by impact × uncertainty
- ☐ 3. feat(turn): run one pure turn from intake to accepted
- ☐ 4. feat(keyframes): run keyframes check on a staged draft
- ☐ 5. feat(emit): emit the keyframes draft and cut it for playback
- ☐ 6. feat(store): keep each interview's session files on disk
- ☐ 7. feat(lenses): write the frame and intent lenses and load them
- ☐ 8. feat(models): reach the local and frontier models through fascicle
- ☐ 9. feat(flow): run intake and the asking turns through the models
- ☐ 10. feat(draft): draft, check and play back, then write on accept
- ☐ 11. feat(cli): run one interview turn from the command line
- ☐ 12. feat(front): drive the first interview from the Claude Code skill
- ☐ 13. docs(research): record the keyframes redraft against the original

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

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

- (none yet)

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
