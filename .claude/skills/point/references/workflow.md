# Why the workflow is shaped this way

## The core failure mode this guards against

An agent that both defines "done" (writes the tests) and pursues "done" (writes the code) can
satisfy the letter of the test without satisfying the goal — including, in the worst case,
editing the test itself to match broken logic rather than fixing the logic. This isn't a
hypothetical: it's the most commonly reported failure mode of test-driven autonomous coding
loops. The fix is structural, not a prompt instruction: separate who writes the spec from who
implements it, and make the test files read-only to the implementation step.

That's why `spec` and `run` are distinct commands with a human approval gate between them, and
why `run`'s first rule is "never edit the files in `tests:`". If a test turns out to be wrong,
that's a signal to go back to a human-reviewed `spec` pass, not something `run` gets to decide
unilaterally.

## Why tests are reviewed before any implementation is attempted

Bad tests are worse than no tests — they either lock in a misunderstanding of the goal (agent
implements against a wrong spec, tests pass, feature is still wrong) or fail for uninteresting
reasons (import errors, typos) that waste implementation cycles without exercising real logic.
Five minutes of human review at `spec` time is cheap; discovering the same problem after a
`background` loop has burned several cycles against it is not.

## Why `run` is bounded, not infinite

An unattended loop with no stopping condition will keep burning tokens against a spec that might
itself be unreachable (contradictory acceptance criteria, a dependency that doesn't exist, a
misunderstanding from `spec` time). Bounding attempts and moving to `blocked` with a specific
note turns a silent runaway into a visible, actionable stop. The Notes field exists so the human
looking at a `blocked` point doesn't have to re-derive what was tried — the failure is legible
without replaying the session.

## Why `run` stops at a PR instead of merging

This mirrors the standing rule that hard-to-reverse and shared-visibility actions (pushing,
opening PRs, merging) need a human checkpoint. Opening a PR is the natural place to stop: it's a
complete, reviewable unit of work, and merging is a judgment call about timing/scope/quality that
belongs to the user even when the tests genuinely pass. This also means a merged point can turn
out to be incomplete in ways tests didn't catch (UX quality, a missed edge case) — that's fine,
it's what PR review is for. Don't treat green tests as a substitute for that review.

## Why background runs never skip the `spec` approval

It's tempting to let an unattended loop draft its own tests and proceed straight through, since
that's the whole point of "background." Resist it. The value of the human checkpoint doesn't
disappear because no one's watching in real time — it just means a background loop should stop
*earlier* (at `planned`, with draft tests left in the Notes for the user to review whenever they
next check in) rather than skip the check. A loop that silently self-approves its own spec has
given up the one thing that made TDD-gating worth doing.

## Why background scheduling goes through the `schedule` skill rather than a raw cron tool

Session-scoped scheduling (an in-conversation cron-like tool) dies with the session and is capped
at a matter of days — it can't actually survive "whenever I get refreshed tokens" the way the
user wants. The `schedule` skill's cloud-scheduled agents are durable and server-side: they fire
regardless of whether this terminal session or any particular token window is still open. That's
the actual mechanism behind "runs in the background and picks back up later" — everything else in
this skill (the backlog file, the status machine, the bounded attempts) is what makes it safe to
let that mechanism run unattended.

## Why one file per point, committed to the repo

Keeping backlog files in the repo (rather than a separate database or a single big file) means:
they show up in `git log` and PR diffs like any other change, they're visible to anyone who clones
the repo, and a point's history (Notes) travels with the code it's about rather than living in a
separate system that can drift out of sync. The tradeoff is repo clutter for long-abandoned
points — that's why merged/abandoned points should be deleted rather than accumulated.

## Why dependent points are stacked instead of forced fully sequential

Running every point strictly one-at-a-time (nothing starts until the previous one merges) avoids
semantic conflicts entirely, but throws away the main benefit of a backlog loop — most points, in
practice, don't actually touch the same code, and serializing them anyway just makes everything
slower for no benefit. Running everything in parallel off `main` gets the speed back but risks two
kinds of conflict: textual (cheap — an ordinary merge conflict, resolved with a routine rebase)
and semantic (expensive — a point's implementation is only "correct" against an assumption another
concurrent point is about to invalidate, and tests on each branch pass in isolation while the
combination is wrong).

Stacking is the industry's answer to exactly this tradeoff (see `git-spice`, Graphite, Sapling):
default to parallel/independent, and only pay the serialization cost — branching a dependent point
off the point it actually depends on, rather than off `main` — for the pairs that need it. See
`references/dependencies.md` for how that detection and branching actually happens. The
alternative some teams reach for, always-sequential, trades a solvable problem (occasional merge
conflicts) for a certain one (every point waits on every other point regardless of whether they're
related).

## Why cleanup happens automatically at Sync, not as a separate command

A point that's actually done (PR merged) but still sits in `.claude/backlog/` as
`done-pending-review` is worse than useless: `list` shows stale work, and — more importantly — the
dependency check in `new` could compare a brand-new point against it and wrongly treat a finished,
merged point as still "active," stacking something that has no reason to be stacked. Folding the
merge-check into the same Sync pass that already runs before `list`/`new`/`run` means the backlog
can't go stale in a way that corrupts a decision the user never sees — cleanup isn't just tidiness
here, it's an input to the dependency detector.

## Why CI auto-fix is turned on but auto-merge never is

Auto-fix keeps a PR green without anyone babysitting it — genuinely just saving effort, since a
red check from a flaky test or a lint nit isn't a decision, it's busywork. Merging is a different
kind of action entirely: it's the one place in this whole loop where "the tests pass" gets treated
as equivalent to "this is actually what I wanted," and that equivalence is exactly the gap TDD
narrows but never closes. Keeping the two switches independent — fix freely, merge never
automatically — means unattended runs can be genuinely unattended without also being allowed to
ship themselves. See `references/ci-monitoring.md` for the mechanism.
