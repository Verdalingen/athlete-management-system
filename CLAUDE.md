# Garmin AI Coach

Personal training system for one athlete (Adrian). A Python pipeline pulls Garmin data,
runs a LangGraph coaching workflow, writes plans to Supabase, and pushes structured
workouts back to Garmin Connect. A Next.js app in `web/` is the front end.

## Commands

Python side is managed by **pixi** — use the tasks, not a bare `python`:

```bash
pixi run test           # pytest
pixi run test-cov       # with coverage
pixi run lint-ruff      # ruff check .
pixi run type-check     # mypy .
pixi run format         # black + isort
pixi run coach-cli      # the coaching CLI
```

`pytest` has `--cov` baked into `addopts`, so a plain run prints a full coverage table.
For a fast pass while iterating: `pixi run test -- -q --no-cov`.

Web side (from `web/`): `npm run dev`, `npm run build`, `npx tsc --noEmit`, `npm run lint`.

CLI entry point is `cli/garmin_ai_coach_cli.py`, driven by mutually-exclusive flags rather
than subcommands: `--config`, `--replan`, `--queue`, `--sync-kpis`, `--sync-history`,
`--shift`, `--set-password`, `--init-config`. See `cli/README.md`.

## Layout

| Path | What |
|---|---|
| `services/garmin/` | Garmin API extraction, workout upload (strength + running) |
| `services/ai/langgraph/` | The coaching workflow — nodes, schemas, state |
| `services/supabase/` | All DB writes; plan writing, drift, bench wave |
| `cli/` | Command-line entry point |
| `supabase/migrations/` | Numbered SQL migrations, append-only |
| `tests/` | pytest suite |
| `web/` | Next.js app — **read `web/AGENTS.md` before touching it** |

## The architectural through-line

Rules that are mechanically checkable have been moved **out of the LLM prompt and into
Python**, because Python is verifiable and prompts are not. Slot rotation, bench-wave
periodisation, weekly volume enforcement, legs-before-hard-runs spacing, running-session
rendering and plan-drift detection all work this way. Several of these moved only after a
prompt rule demonstrably failed on real check-ins.

If you find yourself adding a prompt instruction to enforce something countable, that is
the signal it belongs in code with a test instead.

## Gotchas that have actually cost time

- **Next.js 16 calls it `proxy.ts`, not `middleware.ts`.** `web/proxy.ts` handles Supabase
  session refresh and route gating. Searching for `middleware.*`, finding nothing, and
  concluding it is missing produced a duplicate file that wedged the dev server. Framework
  conventions here differ from training data — `web/AGENTS.md` says this explicitly.
- **Do not start a dev server.** Adrian runs `npm run dev` from his own terminal. Port 3000
  being busy is normal. Never kill it without asking.
- **Verify UI in his real Chrome** (`claude-in-chrome` MCP), never the Preview MCP — the
  latter has no Supabase session so every page shows the login screen, which looks like a
  passing check while proving nothing. This is enforced by a deny rule. See `web/CLAUDE.md`.
- **zsh needs globs quoted**: `grep -rn "x" --include="*.py"` fails bare; quote the pattern.
- **`web/.next` can corrupt** and will produce type errors in *generated* files
  (`.next/dev/types/`) that have nothing to do with your code. `rm -rf web/.next` and restart.
- **Timezones**: always `datetime.now(timezone.utc)` for anything written to a `timestamptz`.
  Naive local time gets read as UTC and skews by the local offset.
- **Vercel Root Directory is `web`.** Deploys happen via `git push` (GitHub integration).
  Running `vercel --prod` from inside `web/` fails — the upload root doubles up.

## Migrations

Append-only and numbered. Each file starts with a comment explaining *why*, not just what.
A migration that reverses an earlier one keeps both files rather than editing history —
see `039`/`041` for the pattern, and note `041` shipped once with no SQL in it at all, so
check that a migration actually contains DDL before assuming it ran.
