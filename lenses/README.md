# Lenses

A lens owns some of the brief's slots, a bank of questions for them, and a rubric for drafting
what they land in. The scheduler turns to a lens when its slots hold the biggest gap. Lenses are
content, not code: `src/lens.ts` reads them, and both front ends use the same files.

They aren't Claude Code skills, even though each has a `SKILL.md`. If they were in `skills/`,
Claude could load one out of the scheduler's order. `skills/` holds only the front end.

## What a lens holds

Each lens is a folder:

- **`SKILL.md`** says what the lens is for, which slots it owns, what makes each one Clear, and
  when it's the biggest gap.
- **`questions.md`** is its question bank, broad to narrow. Every question after intake's carries
  a recommended answer, and design questions will carry previews.
- **`rubric.md`** says what a good draft of its artifacts holds, and which generic defaults to
  steer away from.

`src/lens.ts` refuses a lens that doesn't read, naming the file and the line, and a test loads
every folder here, so a typo fails `pnpm check` rather than an interview.

### `SKILL.md`

It opens with frontmatter giving the lens's `name`, which is its folder's, and a `description`.
Under `## Slots`, a table lists the slots:

| Slot | Holds | Impact | Lands in |
| --- | --- | --- | --- |
| problem | The problem it solves, and what happens today without it | 3 | Intent |

- **Slot** is the slot's id, in lowercase words joined by hyphens, unique across every lens.
- **Holds** says what it holds, in a few words.
- **Impact** is 1, 2 or 3: how much the draft depends on it. The scheduler asks next about the
  slot whose impact, times how unsure the brief is about it, is highest.
- **Lands in** is the section of `keyframes.md` it drafts: Intent, Principles, Constraints,
  Decisions, Taste, Questions or Ideas.

Under `## When a slot is Clear`, a bullet for each slot, `- **problem**: …`, says what an answer
must hold for the slot to be Clear. The interpreting model judges each slot against it.

### `questions.md`

Each question is a bullet, its id in bold and then the question, with a line for each key beneath
it:

```markdown
- **appetite-size**: How much time is it worth before you'd stop and rethink it?
  - kind: menu
  - slots: appetite
  - option: A day or two
  - option: A few weekends
  - recommended: A few weekends
```

- **`kind`** is `intake`, `open` or `menu`. Intake's questions are open and recommend nothing,
  since options steer before the person has said what they mean. They come first, three at most,
  and only in the first lens. An `open` question has no options. A `menu` has two to four.
- **`slots`** names the slots it asks about, all in its own lens.
- **`option`** is one of a menu's options, a line each.
- **`recommended`** is the answer it recommends, on every question but intake's. On a menu it's
  one of the options, written the same way.

Every slot needs a question after intake's, since the scheduler may pick any slot to ask about.
Headings and prose between the questions are for people, and the reader skips them.

## The five lenses

| Lens | Slots | Lands in |
| --- | --- | --- |
| Frame | Problem, who it's for, appetite, no-gos, what done looks like, prior art and existing code | Intent prose; no-gos become Constraints |
| Intent | Principles, constraints, decisions (options considered, and why), taste, open questions, ideas | `keyframes.md`: P, C, D, T, Q, I |
| Behavior | Scenarios and features, acceptance criteria, what's out of scope, the check command | `spec.md`, and Scenarios in `keyframes.md` |
| Design | The feel, references, palette, type, density, voice, and a pick among style tiles | `design/` tokens and tiles, and Taste items |
| Architecture | The parts, what each is for, how they connect, where each lives | `architecture.md`, and Map items |

Folders appear as the build writes them, in the sketch's build order. Two are here so far:
[`frame/`](frame/SKILL.md), whose first three questions are intake's, and
[`intent/`](intent/SKILL.md). Behavior, design and architecture follow in steps 4 to 6. The
design lens sits behind a seam it can leave by: its folder here and its emitter in `src/emit/`,
and nothing else.
