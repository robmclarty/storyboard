# Frame: questions

Broad to narrow. Intake's three come first, and stay open with no menus, since options steer
before the person has said what they mean. After them, each slot has a broad question and then a
narrower one, and every one recommends an answer. When a question asks about the person's world,
its recommendation is the likeliest answer, for them to confirm. When it asks them to make a call,
the recommendation is the safest default.

The phrase step adapts each question to what the person has already said: the options here show
the shape of a good answer, not the words to use. [The lens README](../README.md) gives the form
each question takes.

## Intake

- **intake-1**: What is it, and who's it for?
  - kind: intake
  - slots: problem, audience
- **intake-2**: What would make it a success, and how much time is it worth?
  - kind: intake
  - slots: done, appetite
- **intake-3**: What must it never do?
  - kind: intake
  - slots: no-gos

## The problem

- **problem-today**: What do people do about it today, and what does that cost them?
  - kind: open
  - slots: problem
  - recommended: They work around it by hand each time, and it costs them time and mistakes.
- **problem-shape**: Which is closest to how the problem shows up?
  - kind: menu
  - slots: problem
  - option: It takes too long, every time
  - option: It goes wrong, and someone has to fix it
  - option: It doesn't exist yet, so it doesn't get done
  - option: Something does it, but in a form that doesn't fit
  - recommended: It takes too long, every time

## Who it's for

- **audience-who**: Who will use it most?
  - kind: menu
  - slots: audience
  - option: You alone
  - option: You and a few people you know
  - option: A team, or a company's staff
  - option: People you'll never meet
  - recommended: You alone
- **audience-also**: Besides the people who use it, who else reads or runs what it makes?
  - kind: menu
  - slots: audience
  - option: No one else
  - option: A coding agent working from it
  - option: Whoever maintains it later
  - option: A reviewer, a client or a boss
  - recommended: Whoever maintains it later

## Appetite

- **appetite-size**: How much time is it worth before you'd stop and rethink it?
  - kind: menu
  - slots: appetite
  - option: A day or two
  - option: A few weekends
  - option: A month of evenings
  - option: A season or more
  - recommended: A few weekends
- **appetite-gives**: When time runs short, what gives first?
  - kind: menu
  - slots: appetite
  - option: The scope: ship less, on time
  - option: The date: take longer, and keep it all
  - option: The polish: ship it rough
  - recommended: The scope: ship less, on time

## No-gos

- **no-gos-worst**: Which would be the worst thing it could do?
  - kind: menu
  - slots: no-gos
  - option: Lose or spoil something someone made
  - option: Send something somewhere without asking
  - option: Change something it can't undo
  - option: Spend money or time nobody agreed to
  - recommended: Lose or spoil something someone made
- **no-gos-line**: Is that a line it never crosses, or one it may cross when someone asks?
  - kind: menu
  - slots: no-gos
  - option: Never, whoever asks
  - option: Only when the person says so, each time
  - option: Only in a mode someone turns on
  - recommended: Never, whoever asks

## What done looks like

- **done-sign**: What's the first sign it works?
  - kind: menu
  - slots: done
  - option: You use it for real, and keep using it
  - option: Someone else uses it without your help
  - option: A check or a test passes
  - option: A number moves, such as time saved or sign-ups
  - recommended: You use it for real, and keep using it
- **done-finish**: How finished does the first version need to be?
  - kind: menu
  - slots: done
  - option: Rough, but it does the one job from start to end
  - option: Solid enough to hand to someone else
  - option: Ready to publish
  - recommended: Rough, but it does the one job from start to end

## Prior art

- **prior-art-start**: What does it start from?
  - kind: menu
  - slots: prior-art
  - option: Nothing: an empty folder
  - option: A project it adds to
  - option: An earlier try that didn't work out
  - option: A tool it replaces
  - recommended: Nothing: an empty folder
- **prior-art-borrow**: Is there anything, yours or someone else's, it should copy from or steer
  clear of?
  - kind: open
  - slots: prior-art
  - recommended: Nothing in particular.
