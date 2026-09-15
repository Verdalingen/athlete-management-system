# Cost control

Every place this skill can spend tokens without a human directly watching, and the bound on each.
Nothing here is about tracking actual dollar cost (this skill has no visibility into billing) —
it's about capping how much *work* an unattended point can do before it's forced to stop and
surface itself to a human.

## The four independent bounds

| Bound | Where | Default | What it caps |
|---|---|---|---|
| Per-run cycle cap | `SKILL.md` Run step 7 | ~6 implement/test cycles | One `run` invocation thrashing forever on a single firing |
| Attempt cap | `SKILL.md` Run step 10 | 5 attempts, then `blocked` | Total real implementation tries across every firing of one point |
| Background duration ceiling | `SKILL.md` Run step 1 | 48 hours from `schedule_created_at` | A point that never reaches a terminal state — including one stuck in `waiting` the whole time, which the attempt cap alone wouldn't catch, since `waiting` exits don't increment `attempts` |
| Concurrent-background cap | `SKILL.md` Background step 2 | warn at 3+ already running | Quietly accumulating many simultaneous recurring schedules, each firing (and spending) on its own cadence |

These are deliberately independent, not layers of the same thing: the attempt cap catches "tried
and failed repeatedly"; the duration ceiling catches "never even got to try" (a dependency that
never clears, a scheduling bug, anything that would otherwise loop forever doing cheap no-op
checks indefinitely). Either one alone leaves a gap the other closes.

## Why the duration ceiling has to be checked first, cheaply

The ceiling check (`SKILL.md` Run step 1) has to run before dependency resolution, before
touching the codebase, before anything else — otherwise the very check meant to stop a runaway
would itself contribute to the runaway's cost. It's a single frontmatter read: compare `now` to
`schedule_created_at + max_background_hours`. Nothing more. Same discipline applies to the
`waiting` exit in dependency resolution (step 3) — resolving "is my dependency ready yet" must
never require loading the full codebase; it's a status-file read on the dependency's own backlog
entry, nothing else.

## What's actually in the user's control (not something the skill enforces)

- **Cadence.** This is the single biggest lever on total spend for a backgrounded point:
  cadence × time-to-terminal-state ≈ number of firings. A point expected to resolve in a couple of
  real attempts doesn't need checking every 15 minutes — a tight cadence mostly buys faster
  wall-clock completion at the cost of more `waiting`/no-op firings while it's blocked on
  something else. Start with a longer cadence (the 3-hour default) and tighten it only for
  something genuinely time-sensitive.
- **How many points to background at once.** The concurrent-background warning is a nudge, not a
  hard block — deliberately, since this is a judgment call about the user's own budget, not
  something the skill can decide for them. Starting with one or two points backgrounded at a time
  until there's a real sense of what one firing costs is the safer default before scaling up.
- **Trusting `background` at all before `run` has been exercised on demand.** The first point
  through this whole loop should be run manually (`/point run <slug>`, watched, in the same
  session) at least once, so the actual cost of one implement/test cycle in this specific repo is
  known before handing anything to an unattended schedule with real cadence and duration numbers
  attached.

## What to do if a point is burning more than expected

`/point status <slug>` shows `attempts`, `schedule_created_at`, and the Notes log — that's enough
to see whether it's genuinely iterating (attempts climbing, notes describing real progress or real
failures) or stuck in a no-op `waiting` loop (attempts flat, status unchanged across several
firings). Either way, telling the user to say "cancel `<slug>`" and having that delete the
`schedule_task_id` immediately is always available as a manual override — the ceiling and attempt
caps are the automatic backstop, not the only way to stop something.
