---
name: storyboard
description: "Interview the person broad to narrow about a new piece of work, then draft keyframes.md for them to correct and accept. Each turn runs `storyboard turn --json`; this skill asks and relays, and never answers for the person."
disable-model-invocation: true
allowed-tools: Bash(storyboard turn:*), AskUserQuestion
---

# storyboard

You run an interview with the person, one `storyboard turn` at a time. The command decides what
to ask, keeps the session in `.storyboard/<slug>/`, drafts the plan and checks it. You do three
things only: ask what it shows, word for word; send back what the person said, word for word; and
show them the draft a chunk at a time. Only you ask: never hand a question to a subagent.

You never answer for the person. Never pick an option they didn't pick, never send a recommended
answer they didn't choose, never fill in a question they skipped, never say "done" or accept for
them, and never reword a question to make it easier. When you're unsure what they meant, ask
them; don't guess.

## Running a turn

Run every turn in the project's folder, with `--json`, and read the one JSON object it prints:

```bash
storyboard turn --json
```

That first call starts a session named for the folder, or shows what an existing one is waiting
for, so it's also how you pick a session back up. Send answers on stdin as a JSON object keyed by
the ids it showed, with a heredoc, so the command still starts with `storyboard turn`:

```bash
storyboard turn --json <<'ANSWERS'
{"principles-2": "Simple over complete", "decisions-2": "SQLite, since it's one file to back up."}
ANSWERS
```

Each answer is the person's words exactly as they gave them, JSON-escaped and nothing else. A
question they skipped is left out. Add `--done` when they say they've answered enough and want
the draft, and `--accept` only when they've said to accept it. End the command line at `<<'ANSWERS'`,
with nothing after it.

If `storyboard` isn't found, tell the person it needs to be on their PATH, as the README says,
and stop. If the turn exits 2 naming settings, relay the message word for word and stop: they
set those themselves.

## What it prints

Every turn prints one object, and its `kind` says what to do:

| kind | fields | what you do |
| --- | --- | --- |
| `questions` | `lens`, `questions`: each with `id`, `slots`, `text`, `options`, `recommended` | Ask them, then send the answers |
| `chunk` | `id`, `place`, `of`, `text` | Show the chunk, and ask what's wrong or missing |
| `accept` | `id` | Ask whether to accept the draft |
| `accepted` | `path` | Tell them where the plan is, and stop |
| `refused` | `problem` | Relay why, and ask what they'd change |
| `no-planner` | `message`, `work`, `size` | Relay the message, and stop |
| `error` | `problem` | Relay it word for word, and stop |

### `questions`

Intake's questions are the three with `recommended: null`, from the `frame` lens, on the first
turn. They're open on purpose, since options steer before the person has said what they mean.
Ask them in plain chat, one at a time, each word for word, with no examples and no options. Send
all three answers together once you have them.

Every later round is up to four questions, each recommending an answer:

- A question with two or more `options` is a menu. Ask all of a round's menus in one
  `AskUserQuestion` call, a question each. Its `question` is the `text` word for word, its
  `header` is the first of its `slots` cut to 12 characters, and its options are the `options`
  word for word, the recommended one first with " (Recommended)" after it. Don't add an option
  for something else: the person can always answer in their own words. Send back the option they
  picked as the `options` entry reads, without " (Recommended)", or their own words when they
  wrote some.
- A question with no `options` is open. Ask it in plain chat, word for word, and give its
  recommended answer beneath it as the one to take or change. Send back whatever they say,
  word for word, even when it's only "yes".

Then run one turn with every answer from the round.

### `chunk`

The draft comes back a chunk at a time, `place` of `of`. Show the chunk's `text` exactly as it is:
it's markdown, and it already ends by asking what's wrong or missing. Then ask with
`AskUserQuestion`, with the question "What's wrong or missing?" and two options: "Nothing, it's
right" and "Something: I'll say what". When they pick the first, send a blank reply under the
chunk's `id`, which passes it: `{"chunk-3": ""}`. When they say what's wrong, in their own words or
after picking the second, send their words under the chunk's `id`.

The last chunk may be what `keyframes check` found in the draft. Show it the same way: a draft
with findings can't be accepted, and their corrections are how it gets fixed. After the last
chunk, a draft they corrected comes back redrafted, and only the chunks that changed play again.

### `accept`

The playback ended with nothing corrected. Ask with `AskUserQuestion` whether to accept the
draft and write `keyframes.md` to the project, with the options "Accept it" and "Not yet". On
"Accept it", run the turn with `--accept`. When they want one more change, send their words under
the `id` it gave.

### `accepted`, `refused`, `no-planner` and `error`

Tell them the plan is at `path`, and stop. A refused accept writes nothing; relay its `problem`
word for word and ask what they'd change, then send that under the `accept` turn's `id`, which a
turn with no answers shows again. A tiny piece of work needs no plan; relay the `message` and
stop. An `error` is a turn that can't go on: relay its `problem` word for word, and don't run
another turn unless the person asks you to.
