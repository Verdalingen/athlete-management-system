"""Lightweight daily check-in workflow.

Costs ~$0.01-0.05 per run vs ~$1+ for the full pipeline. It:
1. Loads the stored scheduled_days and season_plan from disk (no AI).
2. Makes ONE cheap AI call to compare yesterday's Garmin activity against the plan.
3. Returns an updated schedule + a brief daily briefing.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.schemas.agent_outputs import DailyCheckinOutput, ScheduledDay
from services.ai.model_config import ModelSelector
from services.ai.utils.plan_storage import FilePlanStorage
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff

logger = logging.getLogger(__name__)

DAILY_CHECKIN_SYSTEM_PROMPT = """You are a training coach assistant doing a quick daily check-in.

Your job is to:
1. Assess whether yesterday's planned session was completed based on actual Garmin activities.
2. Adjust upcoming days in the schedule if the athlete missed a session or is fatigued.
3. Write a concise daily briefing telling the athlete what to do today and why.

Principles:
- If a session was missed due to life constraints (not fatigue), shift it forward if possible.
- If the athlete is showing fatigue signals (high RHR, low HRV, poor sleep), ease upcoming load.
- Keep adjustments minimal — only change what's necessary.
- Today's session should always be clearly stated in plain language.
- Be concise. The athlete reads this first thing in the morning."""

DAILY_CHECKIN_USER_PROMPT = """## Today's Date
{today_date} ({today_day})

## Planned Schedule (next 14 days)
```json
{scheduled_days_json}
```

## Yesterday's Garmin Activity
```json
{yesterday_activities_json}
```

## Season Plan Context
```
{season_plan_excerpt}
```

## Task
1. Determine if yesterday's planned session ({yesterday_date}, planned: {yesterday_planned}) was completed.
2. Adjust the upcoming schedule if needed (missed session, fatigue, etc.).
3. State clearly what the athlete should do today.

Return your assessment and the updated schedule."""


def _find_yesterday_plan(scheduled_days: list[dict], yesterday: str) -> dict | None:
    return next((d for d in scheduled_days if d["date"] == yesterday), None)


def _excerpt_season_plan(season_plan: str | None, max_chars: int = 800) -> str:
    if not season_plan:
        return "No season plan available."
    return season_plan[:max_chars] + ("…" if len(season_plan) > max_chars else "")


def _merge_updated_days(
    stored: list[dict], updated: list[dict]
) -> list[dict]:
    """Replace entries in stored schedule with any updated ones from the AI (matched by date)."""
    update_map = {d["date"]: d for d in updated}
    return [update_map.get(d["date"], d) for d in stored]


async def run_daily_checkin(
    user_id: str,
    athlete_name: str,
    yesterday_activities: list[dict[str, Any]],
    storage: FilePlanStorage | None = None,
) -> dict[str, Any]:
    """Run the daily check-in. Returns a result dict with today's briefing and updated schedule."""
    if storage is None:
        storage = FilePlanStorage()

    today = date.today()
    yesterday = today - timedelta(days=1)
    today_str = today.isoformat()
    yesterday_str = yesterday.isoformat()

    # Load stored data — no AI, just disk reads
    scheduled_days: list[dict] = storage.load_json(user_id, "scheduled_days") or []
    season_plan: str | None = storage.load_plan(user_id, "season_plan")

    if not scheduled_days:
        logger.warning("No stored scheduled_days found for user %s — run the full pipeline first", user_id)
        return {
            "error": "No stored plan found. Run the full coach-cli pipeline first.",
            "today_session": "No plan available.",
            "summary_markdown": "# Daily Check-In\n\nNo training plan found. Run `pixi run coach-cli` first.",
        }

    # Limit to next 14 days for the prompt (keeps tokens low)
    upcoming = [d for d in scheduled_days if d["date"] >= today_str][:14]
    yesterday_plan = _find_yesterday_plan(scheduled_days, yesterday_str)

    yesterday_planned_desc = (
        f"{yesterday_plan['focus']}: {yesterday_plan['description']}"
        if yesterday_plan and not yesterday_plan.get("is_rest")
        else "Rest day" if yesterday_plan
        else "No session planned (date not in stored schedule)"
    )

    logger.info(
        "Daily check-in for %s | yesterday planned: %s | activities: %d",
        athlete_name, yesterday_planned_desc, len(yesterday_activities),
    )

    start_time = datetime.now()

    async def call_checkin():
        llm = ModelSelector.get_llm(AgentRole.SUMMARIZER).with_structured_output(DailyCheckinOutput)
        return await llm.ainvoke([
            {"role": "system", "content": DAILY_CHECKIN_SYSTEM_PROMPT},
            {"role": "user", "content": DAILY_CHECKIN_USER_PROMPT.format(
                today_date=today_str,
                today_day=today.strftime("%A"),
                scheduled_days_json=json.dumps(upcoming, indent=2),
                yesterday_activities_json=json.dumps(yesterday_activities, indent=2),
                season_plan_excerpt=_excerpt_season_plan(season_plan),
                yesterday_date=yesterday_str,
                yesterday_planned=yesterday_planned_desc,
            )},
        ])

    result: DailyCheckinOutput = await retry_with_backoff(
        call_checkin, AI_ANALYSIS_CONFIG, "Daily Check-in"
    )

    execution_time = (datetime.now() - start_time).total_seconds()
    logger.info("Daily check-in completed in %.1fs", execution_time)

    # Merge any adjustments back into the full stored schedule and persist
    if result.updated_days:
        updated_dicts = [d.model_dump() for d in result.updated_days]
        merged = _merge_updated_days(scheduled_days, updated_dicts)
        storage.save_json(user_id, "scheduled_days", merged)
        logger.info("Updated %d day(s) in stored schedule", len(result.updated_days))

    return {
        "yesterday_status": result.yesterday_status,
        "yesterday_notes": result.yesterday_notes,
        "today_session": result.today_session,
        "today_focus": result.today_focus,
        "adjustments": result.adjustments,
        "summary_markdown": result.summary_markdown,
        "execution_time_seconds": execution_time,
    }
