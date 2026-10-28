---
name: storyboard
description: "Interview a person broad to narrow about an idea or an existing project, then draft keyframes.md, spec.md, design tokens and a map of the parts for them to correct. Not built yet."
disable-model-invocation: true
---

# storyboard

Not built yet. This is the Claude Code front end's place in the package, held so the first
build fills it rather than inventing it. `disable-model-invocation` stays on until the skill does
something.

The shape it's meant to take, from [the sketch](../../docs/specs/initial_sketch.md) and
[the architecture](../../docs/architecture.md):

- The skill stays thin. Each turn, the `storyboard` CLI runs one pure step against
  `.storyboard/<slug>/` and returns the next questions and the lens that owns them.
- The skill asks them with `AskUserQuestion`, one to four at a time, each with a recommended
  answer. Design questions carry previews. Only the main loop can ask, so no subagent does.
- The answers go back to the CLI, which updates the brief. When nothing is worth asking, the
  drafts come back in short chunks, each ending "what's wrong or missing?".
