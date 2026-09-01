import json
import logging
from datetime import datetime

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState
from services.ai.model_config import ModelSelector
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff

from .node_base import create_cost_entry, execute_node_with_error_handling, log_node_completion
from .prompt_components import get_workflow_context
from .tool_calling_helper import extract_text_content

logger = logging.getLogger(__name__)

RACE_STRATEGY_SYSTEM_PROMPT = """## Goal
Produce a race-specific preparation protocol covering the 6-week countdown to competition.
This plan overrides or supplements the standard weekly plan for the race period.

## Principles
- Specificity: Advice must be tailored to the exact race distance, terrain, and date.
- Taper logic: Volume reduction typically starts 2-3 weeks out; intensity stays high until week 2.
- Nutrition periodization: Carb loading, race-morning protocol, and hydration are non-negotiable outputs.
- Confidence building: The final week should feel controlled and confidence-inspiring, not exhausting."""

RACE_STRATEGY_USER_PROMPT = """## Task
Produce a 6-week race preparation protocol for the upcoming competition.

## Inputs

### Upcoming Competition
{competition}

### Current Fitness State (from Expert Outputs)
Metrics: {metrics_signals}
Physiology: {physiology_signals}
Nutrition: {nutrition_signals}

### Current Training Plan
{weekly_plan}

### Athlete Context
{analysis_context}

### Current Date
{current_date}

## Output Format

### 1. Race Overview
- Race: [name, distance, date, terrain]
- Weeks to race: [N]
- Current fitness baseline and race readiness rating (1-10)

### 2. Week-by-Week Countdown
For each of the 6 weeks (Week 6 → Race Week):
| Week | Focus | Volume % | Key Sessions | Taper Notes |
|---|---|---|---|---|

### 3. Race Week Protocol
- Mon-Sat daily schedule (very specific)
- Sleep and travel logistics
- Pre-race day routine

### 4. Race-Day Nutrition Protocol
- Pre-race meal (timing and macros)
- During-race fueling (gels, fluids, timing by km/mile)
- Post-race recovery nutrition

### 5. Pacing Strategy
- Target splits or effort zones by race segment
- Contingency pacing (if ahead / behind plan at halfway)

### 6. Mental & Logistics Checklist
- Equipment, kit, race-morning checklist
- 3 key mental cues for the race"""


def _nearest_competition(competitions: list[dict], current_date: dict) -> dict | None:
    """Return the soonest upcoming competition within 6 weeks, or None."""
    from datetime import date, timedelta
    try:
        today_str = current_date.get("date") or current_date.get("today") or str(date.today())
        today = date.fromisoformat(today_str[:10])
        cutoff = today + timedelta(weeks=6)
    except (ValueError, TypeError):
        return None

    upcoming = []
    for comp in competitions:
        raw = comp.get("date") or comp.get("start_date") or ""
        try:
            comp_date = date.fromisoformat(str(raw)[:10])
            if today <= comp_date <= cutoff:
                upcoming.append((comp_date, comp))
        except (ValueError, TypeError):
            continue

    if not upcoming:
        return None
    upcoming.sort(key=lambda x: x[0])
    return upcoming[0][1]


async def race_strategy_node(state: TrainingAnalysisState) -> dict[str, list | str]:
    competition = _nearest_competition(state.get("competitions", []), state.get("current_date", {}))
    if not competition:
        logger.info("Race strategy: no competition within 6 weeks — skipping")
        return {}

    logger.info("Starting race strategy node for competition: %s", competition.get("name", "unknown"))

    def _signals(outputs, field: str) -> str:
        if not outputs or not hasattr(outputs, "output"):
            return "Not available"
        out = outputs.output
        if not hasattr(out, field):
            return "Not available"
        payload = getattr(out, field)
        return f"Signals: {payload.signals}\nEvidence: {payload.evidence}"

    system_prompt = get_workflow_context("race_strategy") + RACE_STRATEGY_SYSTEM_PROMPT
    user_content = RACE_STRATEGY_USER_PROMPT.format(
        competition=json.dumps(competition, indent=2),
        metrics_signals=_signals(state.get("metrics_outputs"), "for_weekly_planner"),
        physiology_signals=_signals(state.get("physiology_outputs"), "for_weekly_planner"),
        nutrition_signals=_signals(state.get("nutrition_outputs"), "for_weekly_planner"),
        weekly_plan=state.get("weekly_plan") or "No plan generated yet.",
        analysis_context=state.get("analysis_context", ""),
        current_date=str(state.get("current_date", {})),
    )

    agent_start_time = datetime.now()

    async def call_llm():
        response = await ModelSelector.get_llm(AgentRole.RACE_STRATEGY).ainvoke(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]
        )
        return extract_text_content(response)

    async def node_execution():
        race_strategy = await retry_with_backoff(call_llm, AI_ANALYSIS_CONFIG, "Race Strategy")
        execution_time = (datetime.now() - agent_start_time).total_seconds()
        log_node_completion("Race strategy", execution_time, 0)
        return {
            "race_strategy": race_strategy,
            "costs": [create_cost_entry("race_strategy", execution_time)],
        }

    return await execute_node_with_error_handling(
        node_name="Race strategy",
        node_function=node_execution,
        error_message_prefix="Race strategy failed",
    )
