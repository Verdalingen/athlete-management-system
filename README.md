# garmin-ai-coach — 🏊‍♂️🚴‍♂️🏃‍♂️ Your AI Endurance Coach

> Personal training system built around a LangGraph multi-agent coaching pipeline:
> pulls Garmin Connect data, produces an evidence-based training analysis
> (`analysis.html`) and a season strategy + compact 4-week plan (`planning.html`),
> then pushes the resulting structured workouts *back* to Garmin Connect. A
> Next.js + Supabase web app sits on top for day-to-day use — plan calendar,
> nutrition tracking, and weekly check-ins — backed by the same Python pipeline.

[![Made with Python](https://img.shields.io/badge/Made%20with-Python-blue.svg)](https://python.org)
[![Powered by LangGraph](https://img.shields.io/badge/Powered%20by-LangGraph-purple.svg)](https://langchain-ai.github.io/langgraph/)
[![Next.js](https://img.shields.io/badge/Web-Next.js%20%2B%20Supabase-black.svg)](web/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Providers:** OpenAI, Anthropic, and OpenRouter (DeepSeek/Gemini/Grok via OpenRouter).

> Not affiliated with Garmin. Not medical advice.

---

## Two halves of one system

- **[`web/`](web/)** — the actual day-to-day interface: a Next.js dashboard
  (deployed on Vercel) with a plan calendar, nutrition tracking, and weekly
  check-ins. This is what's in daily use.
- **CLI (`cli/`)** — the pipeline driver underneath it. It runs the same
  LangGraph coaching workflow and Garmin sync (`services/ai/langgraph/`,
  `services/garmin/`), invoked both interactively (`--config`, `--replan`)
  and as the background job runner behind the web app's check-ins and
  syncs (`--queue`, `--sync-kpis`, `--shift`). Athlete context, credentials,
  and the plan itself all live in Supabase — the CLI reads/writes there
  directly rather than working off local files. See [`cli/README.md`](cli/README.md).

Both require a Supabase project and an LLM provider key (`.env`, based on
[`.env.example`](.env.example)); the CLI additionally needs `SUPABASE_USER_ID`
set to the athlete it's running for.

---

## 🚀 Quick Start (CLI, Pixi)

```bash
# 1) Install dependencies
pixi install

# 2) Set provider + Supabase env vars (see .env.example)
cp .env.example .env

# 3) Create a config (athlete name/email; coaching context comes from Supabase)
pixi run coach-init my_training_config.yaml

# 4) Run
pixi run coach-cli --config my_training_config.yaml
```

Open the generated reports:

- `./data/analysis.html`
- `./data/planning.html`

For the web app, see [`web/README.md`](web/README.md).

---

## ✨ What You Get

- KPI dashboard: chronic/acute load, ACWR, HRV, sleep RHR, weight trend
- Running execution analysis: progression evidence + coaching insights
- Physiology & readiness: baseline profiling + crash signature detection
- Actionable recommendations grouped by domain (load, running, cycling, recovery)
- Season strategy (typically 12–24 weeks) + compact 4-week plan (28 days)
- **Bidirectional Garmin sync**: pulls activities/metrics, and pushes the plan's
  structured workouts (strength sets/reps, running interval segments with pace
  targets) back to Garmin Connect so they show up on-watch
- Optional: HITL questions (`hitl_enabled: true`)
- Optional: competition import from Outside (BikeReg/RunReg/TriReg/SkiReg)
- Optional: LangSmith tracing + cost tracking (`LANGSMITH_API_KEY`)

---

## 🎯 See It In Action

### 📊 Analysis Reports

![KPI Dashboard](docs/screenshots/kpi_dashboard.png)
*Key Performance Indicators: training load, ACWR, HRV, recovery metrics, and body composition at a glance*

![Running Execution Analysis](docs/screenshots/running_execution_analysis.png)
*Evidence-based progression tracking with threshold durability insights and coaching notes*

![Physiology & Readiness](docs/screenshots/physiology_readiness.png)
*Deep physiological analysis: baseline profiling, crash signature detection, and current readiness assessment*

![Actionable Recommendations](docs/screenshots/recommendations.png)
*Sport-specific recommendations organized by category: load management, running, cycling, and recovery*

### 📅 Training Plans

![Season Plan Overview](docs/screenshots/season_plan_overview.png)
*Macro-cycle season plan with race anchors, phase architecture, and periodization timeline*

![Daily Workout Details](docs/screenshots/plan_workout_day.png)
*Structured day plan with intensity zones, adaptations, and monitoring cues*

---

## 🖥️ Web App

[`web/`](web/) is a Next.js app (deployed on Vercel) that runs the same
coaching pipeline against Supabase instead of local files, for day-to-day use:

- **Dashboard** — KPIs, plan calendar, and this week's sessions at a glance
- **Plan** — the full 4-week structured plan, with drift detection when actual
  training diverges from what was planned
- **Nutrition** — daily calorie/macro targets computed from BMR + session-specific
  active burn, food logging with live barcode scanning (`BarcodeDetector` on
  Chromium, native-camera-capture + ZXing fallback on iOS/WebKit), and
  Open Food Facts lookup with Nordic/Scandinavian coverage
- **Report** — the weekly analysis/check-in, rendered from the same LangGraph
  output as `analysis.html`
- **Setup / Profile** — Supabase-authenticated config, replacing the CLI's YAML file

Multi-user by design: credentials and training config live per-user in Supabase
(`services/supabase/`), with Garmin credentials resolved via Supabase Vault
(`services/garmin/credentials.py`) rather than a shared local config.

---

## 🧠 How It Works (High Level)

```mermaid
flowchart LR
    GC["Garmin Connect"] --> SUM["Summarizers<br>metrics • physiology • activity"]
    SUM --> EXP["Experts<br>metrics • physiology • activity"]
    EXP --> ORCH["Master Orchestrator<br>(HITL optional)"]
    ORCH --> ANALYSIS["analysis.html / Report page"]
    ORCH --> SEASON["Season plan<br>(12–24 weeks)"]
    SEASON --> WEEK["4-week plan<br>(28 days)"]
    WEEK --> PLANNING["planning.html / Plan page"]
    WEEK --> PUSH["Structured workouts"]
    PUSH --> GC
```

Docs:

- CLI usage: [`cli/README.md`](cli/README.md)
- Web app: [`web/README.md`](web/README.md)
- Full architecture diagram: [`agents_docs/langgraph_architecture_diagram.mmd`](agents_docs/langgraph_architecture_diagram.mmd)
- Tech stack & internals: [`agents_docs/techStack.md`](agents_docs/techStack.md)

### Design principle: checkable rules live in code, not prompts

Anything mechanically verifiable — weekly volume enforcement, leg-day/hard-run
spacing, running-session rendering, plan-drift detection — is implemented in
Python with tests, not as an LLM prompt instruction. Several of these moved
out of the prompt only after the prompt-based version demonstrably failed on
real check-ins. The LLM is reserved for judgment calls (season strategy,
context-dependent coaching notes); anything countable is enforced deterministically.

---

## 📋 Configuration (YAML/JSON)

Start from the template:

- `pixi run coach-init my_training_config.yaml`
- or copy [`cli/coach_config_template.yaml`](cli/coach_config_template.yaml)

Minimal example:

```yaml
athlete:
  name: "Your Name"
  email: "you@example.com"  # ignored if SUPABASE_USER_ID resolves an email via Vault

extraction:
  activities_days: 21
  metrics_days: 56
  ai_mode: "standard"          # development | standard | cost_effective | pro
  enable_plotting: false
  hitl_enabled: true
  skip_synthesis: false

competitions:
  - name: "Target Race"
    date: "2026-04-15"
    race_type: "Half Marathon"
    priority: "A"
    target_time: "01:40:00"

# Optional: auto-import competitions from Outside (BikeReg/RunReg/TriReg/SkiReg)
outside:
  bikereg:
    - id: 71252
      priority: "B"

output:
  directory: "./data"

# Optional: keep empty to be prompted securely at runtime
credentials:
  password: ""
```

Coaching context (the athlete's goals/constraints the LLM plans around) isn't
part of this file — it's read live from Supabase (`athlete_profile`, set up via
the web app's setup wizard), keyed by `SUPABASE_USER_ID`.

---

## 📦 Outputs

Generated files in `output.directory` (default: `./data`):

- `analysis.html` — training analysis report
- `planning.html` — season overview + compact 4-week plan
- `metrics_expert.json`, `activity_expert.json`, `physiology_expert.json` — structured expert outputs
- `season_plan.md`, `weekly_plan.md` — intermediate planning artifacts
- `summary.json` — metadata + cost summary (`trace_id` / `root_run_id` when LangSmith is enabled)

---

## 🎛️ Providers & Model Selection

Set at least one provider API key (e.g. in `.env`):

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY` (DeepSeek/Gemini/Grok, and can also act as a fallback router)

The run’s `ai_mode` comes from `extraction.ai_mode` (the CLI exports it to `AI_MODE` internally).

Defaults (role→model mapping) live in:

- [`services/ai/ai_settings.py`](services/ai/ai_settings.py)
- [`services/ai/model_config.py`](services/ai/model_config.py)

Optional:

- `LANGSMITH_API_KEY` enables LangSmith tracing / cost tracking.

---

## 🔒 Privacy / Data Handling

- Your Garmin metrics, plans, and nutrition logs are stored in your own Supabase project — no shared, first-party backend.
- The CLI additionally writes local report files (`analysis.html`, `planning.html`) to your machine.
- Your Garmin-derived data is sent to your configured LLM provider to generate the reports.
- If `LANGSMITH_API_KEY` is set, workflow traces (including prompt/response content) are sent to LangSmith.

---

<details>
<summary>Advanced: Installation without Pixi</summary>

```bash
pip install -r requirements.txt
python cli/garmin_ai_coach_cli.py --init-config my_training_config.yaml
python cli/garmin_ai_coach_cli.py --config my_training_config.yaml
```

</details>

<details>
<summary>Advanced: Development</summary>

```bash
pixi run lint-ruff
pixi run ruff-fix
pixi run format
pixi run type-check
pixi run test
pixi run dead-code
```

Project structure:

```text
garmin-ai-coach/
├── core/                     # Configuration
├── services/
│   ├── garmin/               # Garmin Connect extraction + workout upload (strength/running)
│   ├── ai/langgraph/         # LangGraph workflows + nodes
│   ├── ai/tools/plotting/    # Optional plotting tools
│   ├── supabase/             # DB writes: plan writing, drift, credentials
│   └── outside/              # Outside (BikeReg/RunReg/...) competitions
├── cli/                      # CLI entrypoint + config template
├── supabase/migrations/      # Numbered SQL migrations (append-only)
├── web/                      # Next.js + Supabase web app
├── agents_docs/              # Internal docs (architecture/stack)
└── tests/
```

</details>

---

## 🤝 Contributing

PRs welcome. If you're adding features, please keep the checkable-rules-in-code
principle above intact and add tests where it makes sense — Python side via
`pixi run test`, web side per [`web/AGENTS.md`](web/AGENTS.md).

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
