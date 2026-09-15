# The `github-actions` background backend

The `app` backend (the `schedule` skill's recurring cloud-scheduled task) requires this app's
process to be running and the machine awake — it pauses when the laptop sleeps and catches up on
next launch. `github-actions` moves the trigger onto GitHub's own runners, which genuinely don't
care whether the laptop that set this up is open, asleep, or off. It's a real, separate piece of
infrastructure, not a config flag — set it up deliberately, once, per repo.

## How it behaves

**Night window (default 22:00-09:00, `POINT_TZ`/`POINT_NIGHT_START`/`POINT_NIGHT_END` in the
workflow file):** works continuously — one eligible point after another, back to back within a
single job run — until one of three things happens: nothing is left eligible, the window ends, or
a real usage/rate-limit failure is hit. There is deliberately no self-imposed spend cap here (see
"On the 80% idea, and why it's not built this way" below) — it works until the actual API says no,
not until some estimate says stop.

**Daytime:** does nothing on its own. It only runs if triggered manually (`workflow_dispatch`, via
`gh workflow run point-loop.yml` or GitHub's "Run workflow" button) or if a specific toggle is on.

**The toggle:** a GitHub issue whose exact title matches `POINT_DAYTIME_TOGGLE_ISSUE_TITLE` in the
workflow (default `"point-loop daytime toggle"`). Open it to allow daytime runs, close it to stop
them — opening/closing an issue is a one-tap action in the actual GitHub mobile app, which is what
makes this the "easy switch," as opposed to a repo Settings → Actions → Variables toggle that's
really only comfortable from a browser. Create this issue once during setup and leave it closed by
default.

**Rate-limit handling:** when a `claude -p` invocation inside the work loop fails, the workflow
greps its output for a rate-limit-shaped signal (`rate limit`, `usage limit`, `429`, `exceeded ...
quota`) before deciding what happened. If it looks like a real limit, the loop stops for this
firing without treating it as a failed attempt against the point — the next scheduled firing (the
next hourly tick, or the next night) just tries again. This is honest about what it doesn't know:
there's no parsed reset timestamp, so it can waste a few cheap, fast-failing retries between
hitting the limit and it actually clearing, rather than resuming at the exact moment it does. That
tradeoff was chosen over trying to parse an unverified reset time out of CLI output. If the grep
pattern turns out not to match a real occurrence, tighten it against the actual log — it's marked
best-effort in the workflow file's own comments for exactly this reason.

## On the 80% idea, and why it's not built this way

An earlier version of this workflow tracked its own spend in a committed ledger file and refused
to start new work past a configured nightly dollar figure, meant as a stand-in for "stop at 80% of
my usage." That's been removed. Two reasons: it cannot see real account-wide quota (confirmed —
there is no API exposing a Pro/Max subscription's live remaining usage outside the interactive
`/usage` command or the claude.ai usage page), so it was never actually capping "80% of tokens,"
only its own tracked contribution — a number that looks precise but measures the wrong thing. And
it added a real failure mode of its own: a workflow that stops early because a self-estimated
number crossed some threshold, while the actual account still has plenty of room, defeats the
point of "work continuously until you genuinely can't." Letting the real API's rejection be the
stop signal is both more honest and closer to what "use the tokens until they're gone" actually
means.

## One-time setup, per repo

1. **Install the Claude GitHub app** on the repo: https://github.com/apps/claude
2. **Generate a subscription-backed token**: run `claude setup-token` locally (Pro/Max/Team/
   Enterprise plans support this) and add the result as a repository secret named
   `CLAUDE_CODE_OAUTH_TOKEN`. This draws from the same subscription pool as normal interactive
   use — not a separate API-billing account — but that also means heavy background runs compete
   with your own interactive usage, not just cost nothing extra.
3. **Add the workflow**: `.github/workflows/point-loop.yml`. Confirm `POINT_TZ` matches where the
   user actually is, and that `POINT_NIGHT_START`/`POINT_NIGHT_END` match what they want.
4. **Create the daytime-toggle issue**, title matching `POINT_DAYTIME_TOGGLE_ISSUE_TITLE`
   exactly, and close it (default: daytime stays off until explicitly opened).
5. **Strongly recommended: add a PAT as `GH_PAT`.** GitHub's default `GITHUB_TOKEN` deliberately
   does not trigger other workflows on the pushes/PRs it makes (an anti-recursion safeguard) — so
   without this, PRs opened by this workflow will not trigger the repo's own CI, and CI auto-fix
   (`references/ci-monitoring.md`) has nothing to react to. Generate a fine-grained personal
   access token scoped to just this repo, with Contents and Pull requests write access, and add
   it as the repo secret `GH_PAT`. The workflow falls back to `GITHUB_TOKEN` if this isn't set, so
   it still runs without it — just without CI auto-triggering on its PRs.
6. **Sync the skill into the repo**: copy `~/.claude/skills/point/` (this whole directory) to
   `.claude/skills/point/` inside the repo, and commit it. A GitHub Actions runner is a fresh
   checkout with no access to the laptop's `~/.claude/` — without a repo-local copy, the headless
   Claude Code instance the workflow starts has no idea `/point` exists. **Re-sync after every
   edit to this skill** — the repo-local copy is a snapshot, not a live link, and there's no
   automatic reminder built for this yet, so treat it as a manual step for now.
7. Recommended first run: trigger `workflow_dispatch` manually and watch the Step Summary before
   trusting the cron schedule — same principle as running the first point `run` on-demand before
   backgrounding it at all (`references/cost-control.md`).

## A note on `--dangerously-skip-permissions`

The work loop runs `claude -p` with this flag, because there's no human present in CI to approve
tool calls. This is standard practice for headless Claude Code automation, but it means Claude has
full tool access within that sandboxed, ephemeral runner for the duration of each call. What
actually constrains it is the point skill's own guardrails — never edit the committed test files,
bounded implement cycles, PR-not-merge — not the CI sandbox itself. Worth knowing, not a reason to
avoid this backend, since those guardrails are exactly the mechanism designed to hold even
unattended.

## Choosing between the two backends

Default to `app` unless the point genuinely needs to survive the laptop being off — it's simpler,
needs no extra setup once the schedule skill is available, and its scheduling gaps (paused while
asleep, catches up on reopen) are usually fine for background work you'll check on within a day.
Reach for `github-actions` specifically for the "closed the laptop and won't touch it for a real
stretch" case this was built for, and treat its one-time setup (above) as a real cost to weigh
against that benefit — it's not free to turn on.
