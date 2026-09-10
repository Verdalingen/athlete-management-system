# Athlete Management System — CLI

The pipeline driver underneath the [web app](../web/README.md). It runs the
LangGraph coaching workflow and the Garmin sync, both interactively and as the
scheduled job runner behind the web app's check-ins.

- Entry point: [`ams.py`](ams.py)
- Config template: [`coach_config_template.yaml`](coach_config_template.yaml)
- Pixi tasks: [`pixi.toml`](../pixi.toml)

## Prerequisites

The CLI reads athlete context, credentials and the plan from Supabase, so it is
not standalone. Before the first run you need:

- A Supabase project with the schema from [`supabase/migrations/`](../supabase/migrations/) applied
- An account created through the web app's setup wizard (this writes `athlete_profile`)
- `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_USER_ID` and a provider key

`SUPABASE_USER_ID` is the UUID of that account (Supabase dashboard → Authentication
→ Users). Without it the CLI cannot resolve coaching context and will exit.

See the [root README](../README.md#running-it) for the full first-run sequence.

## Quick start

```bash
pixi run coach-init my_training_config.yaml   # write a config template
pixi run coach-cli --config my_training_config.yaml
```

Outputs land in `output.directory` (default `./data`): `analysis.html`,
`planning.html`, the structured expert JSON, and `summary.json` with cost
metadata.

## Commands

The CLI is flag-driven, and the modes are mutually exclusive.

| Flag | What it does |
|---|---|
| `--config PATH` | Full run: extract Garmin data, analyse, plan, write to Supabase, push workouts |
| `--replan PATH` | Weekly re-plan — fetches 14 days and re-runs planning against the current plan |
| `--queue PATH` | Process re-plan jobs queued from the web UI (this is the background worker) |
| `--sync-kpis PATH` | Lightweight KPI sync, no LLM calls. Safe to run frequently |
| `--sync-history PATH` | Backfill up to 365 days of Garmin trend data into `daily_metrics` |
| `--shift PATH` | Slide the remaining plan forward `--days` (default 1), preserving structure |
| `--set-password PATH` | Store the Garmin password in the system keychain (local use; the hosted path uses Supabase Vault) |
| `--init-config PATH` | Write a config template and exit |

Extra options: `--output-dir PATH` overrides the config's output directory;
`--days N` and `--from-date YYYY-MM-DD` apply to `--shift`.

`--queue`, `--sync-kpis` and `--sync-history` are what the macOS LaunchAgents in
[`scripts/`](../scripts/) invoke on a schedule.

## Configuration

The YAML file covers *mechanics* — how much data to pull, which model mode, where
to write. **Coaching context is not in this file.** Goals, constraints and
recurring session requests live in Supabase on `athlete_profile`, written by the
web app's setup wizard and read live on every run.

Keys:

- `athlete` — `name`, `email` (the Garmin Connect address)
- `extraction` — `activities_days`, `metrics_days`, `ai_mode`, `enable_plotting`,
  `hitl_enabled`, `skip_synthesis`, and the long-term trend window
- `competitions` — list of `{name, date, race_type, priority (A/B/C), target_time}`
- `outside` — optional race import by BikeReg/RunReg/TriReg/SkiReg id or url
- `output` — `directory`
- `credentials` — `password`, optional; empty means Vault, then keychain, then prompt

Minimal example:

```yaml
athlete:
  name: "Your Name"
  email: "you@example.com"

extraction:
  activities_days: 28
  metrics_days: 56
  ai_mode: "standard"
  enable_plotting: false
  hitl_enabled: true

competitions:
  - name: "Target Race"
    date: "2026-04-15"
    race_type: "Half Marathon"
    priority: "A"
    target_time: "01:40:00"

output:
  directory: "./data"

credentials:
  password: ""
```

`ai_mode` is one of `development`, `standard`, `cost_effective`, `pro`, and
overrides `AI_MODE` from `.env` for that run. **`pro` can exceed $10 per run**
depending on how much data is extracted.

## Credentials

The Garmin password is resolved in this order: Supabase Vault (when
`SUPABASE_USER_ID` is set), the system keychain, the config file, then an
interactive prompt. Garmin has no public OAuth flow for this use case — see
[SECURITY.md](../SECURITY.md) for what that implies.
