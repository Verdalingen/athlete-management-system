# Context control

Cost (`references/cost-control.md`) bounds how much *work* happens. This is the separate question
of how much *context* one unit of that work drags along with it — a `run` that stays within its
6-cycle budget can still be a problem if each cycle dumps a large, mostly-irrelevant wall of text
into whatever session is holding it.

## Across firings: not a problem, by construction

A background firing starts with no memory of the conversation that scheduled it, or of any prior
firing of the same point — confirmed by the scheduling tool itself ("each run starts fresh"). The
backlog file's frontmatter and Notes log are the *only* thing that carries forward between
firings, and that's deliberately compact (see `references/backlog-format.md` — Notes is a running
log of short entries, not a transcript). So a point that takes 30 firings to clear a `waiting`
dependency doesn't accumulate 30 firings' worth of context anywhere — each one reads a short file,
decides, and either acts or exits.

## Within one firing: two real risks, both with a concrete fix

**1. The implement loop lives in the wrong session.** An on-demand `/point run` triggered from an
interactive session — one where the user is also discussing something else — used to run its
file-reads/edit/test cycles inline, in that same conversation. Six cycles of reading source,
editing, and reading test output is exactly the kind of thing that should not land in a session
someone is actively using for other work. Fixed in `SKILL.md` Run step 5: the implement loop
(steps 6-8) always runs inside a delegated `Agent` call with `isolation: "worktree"`, regardless
of how `run` was triggered — the calling session only sees the dispatch and the final result
(green + PR, or blocked + note), not the work in between. This mirrors the general principle that
subagents exist partly to protect the caller's context window from a large intermediate result,
not just to parallelize.

**2. Verbose tool output repeated across cycles.** The clearest example: this environment's own
`athlete-management-system` repo has `pytest --cov` baked into its default test command, so a
plain `pixi run test` prints a full coverage table — its own `CLAUDE.md` flags this and recommends
`pixi run test -- -q --no-cov` for iteration. Run that verbose default six times across an
implement loop and most of the context is coverage tables, not signal. The general version of this
applies to any project: check for (and prefer) a documented fast/quiet test invocation during the
implement loop's iterate-and-recheck cycles, and reserve the slow/verbose default for a single
check right before declaring green, if it adds information the quiet run didn't already give. The
same principle applies to file reads — read the failing test and the specific function under
suspicion, not whole files, when a file is large.

## The backstop, and why it's a backstop and not the plan

Claude Code compresses context automatically as a session approaches its limit, so even a
misbehaving cycle that reads too much doesn't hard-fail the loop. Don't rely on it as the primary
mitigation, though — compaction has a real cost (a summarization pass, and some loss of detail
that might matter for the next cycle's decision), so it's there to save a run that goes over
budget despite the two fixes above, not a reason to skip them.
