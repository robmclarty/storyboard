# Lenses

A lens owns some of the brief's slots, a bank of questions for them, and a rubric for drafting
what they land in. The scheduler loads a lens when its slots hold the biggest gap. Lenses are
content, not code: `src/lens/` reads them, and both front ends use the same files.

They aren't Claude Code skills, even though each has a `SKILL.md`. If they were in `skills/`,
Claude could load one out of the scheduler's order. `skills/` holds only the front end.

## What a lens holds

Each lens is a folder:

- **`SKILL.md`** says what the lens is for, which slots it owns, and when it's the biggest gap.
- **`questions.md`** is its question bank, broad to narrow. Each question carries a
  recommended answer, and design questions carry previews.
- **`rubric.md`** says what a good draft of its artifacts holds, and which generic defaults to
  steer away from.

## The five lenses

| Lens | Slots | Lands in |
| --- | --- | --- |
| Frame | Problem, who it's for, appetite, no-gos, what done looks like, prior art and existing code | Intent prose; no-gos become Constraints |
| Intent | Principles, constraints, decisions (options considered, and why), taste, open questions, ideas | `keyframes.md`: P, C, D, T, Q, I |
| Behavior | Scenarios and features, acceptance criteria, what's out of scope, the check command | `spec.md`, and Scenarios in `keyframes.md` |
| Design | The feel, references, palette, type, density, voice, and a pick among style tiles | `design/` tokens and tiles, and Taste items |
| Architecture | The parts, what each is for, how they connect, where each lives | `architecture.md`, and Map items |

Folders appear as the build writes them, in the sketch's build order: intent with intake in step
2, then behavior, design and architecture in steps 4 to 6. Intake's three open questions are the
frame lens's first ones. The design lens sits behind a seam it can leave by: its folder here and
its emitter in `src/emit/`, and nothing else.
