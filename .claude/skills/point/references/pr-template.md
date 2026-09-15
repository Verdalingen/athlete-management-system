# PR template

Fill in every section below — this is what makes a phone-scannable review possible: a checklist
at the top so the reviewer checks boxes against already-agreed criteria instead of reverse-
engineering intent from a raw diff, then a verification section so they don't have to re-run
anything themselves to trust the checkmarks.

## Title

`<Title> (point/<slug>)` — prefix with a conventional-commit type (`fix:`, `feat:`, `refactor:`,
`chore:`) only when the point is unambiguously one of those; skip the prefix rather than force a
bad fit.

## Body

```markdown
## Summary

<1-3 sentences: what changed and why, drawn from the point's Goal.>

## Acceptance criteria

- [x] <criterion 1> — verified by `<test file>::<test name>`
- [x] <criterion 2> — verified by `<test file>::<test name>`

## How this was built

Tests were written first from the criteria above and reviewed/approved before any implementation
began (commit `<test-commit-sha>`). Implementation took <N> attempt(s) to go green.

<Only if depends_on is set:>
Stacked on #<dependency PR number> (`<dependency-slug>`) — merge that first; this branch is based
on it, not on `main`.

## Verification

- Tests: `<exact command run>` → <pass summary, e.g. "14 passed">
- Lint: `<exact command run>` → clean
- Type-check: `<exact command run>` → clean
<Only if UI/browser-facing:>
- Verified in browser: <what was checked, e.g. "settings page loads and saves with 500 rows">

## Out of scope / noticed but not fixed

<Anything adjacent that was noticed during implementation but isn't part of this point's
criteria — name it explicitly so the reviewer isn't left guessing about scope boundaries. If
nothing, write "None.">

## Backlog

Full history and notes: `.claude/backlog/<slug>.md`
```

Then append whatever attribution footer this session's own instructions specify (commonly a
"Generated with Claude Code" line) — use the same convention already in force for this session's
commits and PRs, don't hardcode one here since it can vary by account/setup.

## Rules

- Every criterion gets an explicit test reference. If a criterion has no test that verifies it,
  that's a bug in the `spec` step, not something to paper over here — go back and fix the tests
  instead of writing a PR that claims coverage it doesn't have.
- "Out of scope" is not optional filler — an agent that implemented something adjacent and didn't
  flag it is exactly the kind of scope creep a phone-speed review is likely to miss. Always name
  it or always write "None," never omit the section.
- Never write anything in this template that isn't true of what was actually run — no
  aspirational "lint: clean" without having actually run the linter this invocation.
