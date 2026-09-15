# Backlog file format

One file per point at `.claude/backlog/<slug>.md` in the target repo. Create the directory if it
doesn't exist — it's meant to be committed to the repo, not gitignored, so points and their
history show up in normal `git log`/PR review.

## Frontmatter

```yaml
---
title: Short human-readable title
status: planned | tests-written | waiting | in-progress | blocked | done-pending-review
created: 2026-09-14
updated: 2026-09-14
tests: []            # populated at `spec` time: paths to the committed test file(s)
touches: []           # best-guess files/areas this point involves; set at `new`, refined at `spec`
depends_on:           # slug of another active point this one is stacked on, or empty
attempts: 0          # incremented once per `run` invocation that ends without going green
schedule_backend:     # "app" (default) or "github-actions" — set by `background`, see github-actions.md
schedule_task_id:     # set by `background` when schedule_backend is "app"; cleared at terminal state
schedule_created_at:  # set by `background`; when the recurring schedule was created
max_background_hours: # set by `background`; default 48 — hard wall-clock ceiling, see cost-control.md
pr_url:               # set by `run` once a PR is opened
---
```

Omit or leave empty any field with no value yet (`tests`, `touches`, `depends_on`,
`schedule_task_id`, `schedule_created_at`, `max_background_hours`, `pr_url`) — don't pre-fill
placeholders. `schedule_backend` defaults to `app` when unset (i.e. every point predating this
field behaves exactly as before).

## Body

```markdown
## Goal

Free-text description of what should change and why. Enough context that a fresh session with
no memory of this conversation could pick it up cold.

## Acceptance criteria

- [ ] Concrete, testable statement one
- [ ] Concrete, testable statement two

## Notes

Running log, newest entry first. Used by `run` to record why an attempt failed, by `spec` to
record open questions, and by the user to leave guidance for the next unattended run. Example:

- 2026-09-16: attempt 2 failed — the drift-detection test expects UTC but the endpoint returns
  local time. Looks like a real bug in `services/supabase/drift.py`, not a bad test. Retrying.
- 2026-09-15: attempt 1 failed — misread acceptance criterion 2, fixed misunderstanding, retrying.
- 2026-09-15: depends_on set to `fix-drift-dst` at spec time — both touch
  `services/supabase/drift.py`; branching after it instead of off `main`.
```

## Status meanings

- **planned** — goal + acceptance criteria exist, no tests yet.
- **tests-written** — failing tests exist, committed, reviewed and approved by the user. Ready
  for `run` (on-demand or `background`), unless `depends_on` isn't resolved yet, in which case the
  next `run` will move it to `waiting`.
- **waiting** — queued behind another active point named in `depends_on`. Not stuck — this
  clears automatically once the dependency reaches a terminal state (see Sync in `SKILL.md`).
  Distinct from `blocked`: nothing has gone wrong here, it just isn't this point's turn yet.
- **in-progress** — a `run` is actively mid-loop. Also used to detect (via `updated`) whether a
  concurrent invocation is likely still running versus one that crashed and can be resumed.
- **blocked** — a `run` gave up after repeated failures, the user marked it stuck, or it was
  cascaded into this state because its dependency became `blocked`. Needs a human to look at the
  Notes before resuming (either fix the spec via a fresh `spec` pass, or clear the blocker and
  reset `attempts`).
- **done-pending-review** — tests are green, a PR is open. Terminal for the loop; the human
  decides whether to merge, request changes on the PR normally, or reopen the point if it turns
  out incomplete.

There's no `done` status stored here on purpose — the Sync pass in `SKILL.md` checks every
`done-pending-review` point's PR on each `list`/`new`/`run` invocation and retires (deletes) the
backlog file automatically once that PR has actually merged, rather than tracking "merged" state
twice.
