"""Lightweight daily check-in workflow.

Costs ~$0.01-0.05 per run vs ~$1+ for the full pipeline. It:
1. Loads the stored scheduled_days and season_plan from disk (no AI).
2. Makes ONE cheap AI call to compare yesterday's Garmin activity against the plan.
3. Returns an updated schedule + a brief daily briefing.
4. Writes today's per-day nutrition target to Supabase.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.schemas.agent_outputs import (
    DailyCheckinOutput, NutrientTimingAssessment, ScheduledDay,
)
from services.ai.model_config import ModelSelector
from services.ai.utils.plan_storage import FilePlanStorage
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff
from services.supabase.athlete_memory import get_athlete_memory
from services.supabase.athlete_profile import get_meal_variety_preference
from services.supabase.client import get_supabase

logger = logging.getLogger(__name__)

DAILY_CHECKIN_SYSTEM_PROMPT = """You are a training coach assistant doing a quick daily check-in.

Your job is to:
1. Assess whether yesterday's planned session was completed based on actual Garmin activities.
2. Adjust upcoming days in the schedule if the athlete missed a session or is fatigued.
3. Write a concise daily briefing telling the athlete what to do today and why.
4. Set today's specific nutrition targets based on the planned session and recovery state.
5. Recommend a specific, world-class meal for each meal slot that fits today's targets.

Principles:
- If a session was missed due to life constraints (not fatigue), shift it forward if possible.
- If the athlete is showing fatigue signals (high RHR, low HRV, poor sleep), ease upcoming load.
- Keep adjustments minimal — only change what's necessary.
- Today's session should always be clearly stated in plain language.
- Be concise. The athlete reads this first thing in the morning.

Nutrition target principles:
- Hard/key sessions: higher carbs (4-6g/kg), moderate calorie surplus to support adaptation.
- Easy sessions: moderate carbs (3-4g/kg), maintenance calories.
- Rest days: lower carbs (2-3g/kg), slight deficit is acceptable.
- Protein: 1.8-2.4g/kg body weight on all days — never drop the floor.
- If recovery signals are poor (low HRV, high RHR), increase calories by 5-10% vs template.
- Water: base 35ml/kg + 500ml per hour of planned training.

Meal recommendation principles:
- Recommend one specific, realistic meal per slot (breakfast, pre_workout, lunch, post_workout, dinner, snacks) using real grocery-store ingredients and plausible quantities — not vague ideas.
- Pre/post-workout meals should be protein-forward (≥20g protein) and only recommended on training days — skip both on rest days.
- Vary meals from what's listed under "Recent Meals" — do not repeat the same meal two days running.
- Respect any dietary preferences, restrictions, or allergies noted under "Athlete Profile".
- Sizes should roughly sum across all slots to today's nutrition_target macros — this is a guide, not an exact constraint.
- Also estimate the meal's key micronutrients (micros field) — a reasonable best-effort estimate from the ingredients, not a precise lookup.
- When an ingredient has a natural discrete unit (bread→slices, eggs→count, banana/apple→count or fraction, avocado→fraction), populate serving_qty/serving_label alongside quantity_g. Leave both null for ingredients with no natural discrete unit (rice, oats, leafy greens, sauces).
- For every ingredient, also set shopping_name to what the athlete would actually put on a grocery list — strip cooking method/doneness (baked, grilled, steamed, roasted → the raw ingredient) and generalise personal-choice pantry staples away from a specific flavor (any protein powder flavor → 'Protein powder', any flavored milk → the base milk)."""

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

## Yesterday's Nutrient Timing
{timing_context}

## Athlete Profile
{athlete_memory}

## Recent Meals (avoid repeating)
{recent_meals_context}

## Task
1. Determine if yesterday's planned session ({yesterday_date}, planned: {yesterday_planned}) was completed.
2. Adjust the upcoming schedule if needed (missed session, fatigue, etc.).
3. State clearly what the athlete should do today.
4. Set today's nutrition target (nutrition_target field) — make it specific to today's session and recovery state.
5. If timing data was provided, populate nutrient_timing with an assessment and one-sentence coaching note.
6. Recommend one meal per slot (meal_recommendations) sized to roughly sum to today's nutrition_target, skipping pre_workout/post_workout on rest days.

Return your assessment, the updated schedule, today's nutrition target, the nutrient timing assessment, and the meal recommendations."""


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


def _get_yesterday_timing(user_id: str, yesterday_str: str) -> tuple[str, NutrientTimingAssessment | None]:
    """Fetch yesterday's pre/post workout diary entries from Supabase and compute timing stats."""
    try:
        sb = get_supabase()
        res = (
            sb.table("nutrition_diary")
            .select("meal_type,protein_g,carbs_g,calories")
            .eq("user_id", user_id)
            .eq("date", yesterday_str)
            .in_("meal_type", ["pre_workout", "post_workout"])
            .execute()
        )
        rows = res.data or []
        if not rows:
            return "No pre/post workout nutrition logged yesterday.", None

        pre  = [r for r in rows if r["meal_type"] == "pre_workout"]
        post = [r for r in rows if r["meal_type"] == "post_workout"]
        pre_p  = round(sum(r["protein_g"]  or 0 for r in pre),  1)
        pre_c  = round(sum(r["carbs_g"]    or 0 for r in pre),  1)
        post_p = round(sum(r["protein_g"]  or 0 for r in post), 1)
        pre_cal  = round(sum(r["calories"] or 0 for r in pre))
        post_cal = round(sum(r["calories"] or 0 for r in post))

        lines = []
        if pre:
            lines.append(f"Pre-workout: {pre_cal} kcal · P{pre_p}g · C{pre_c}g ({'✓' if pre_p >= 20 else '⚠ low'})")
        else:
            lines.append("Pre-workout: nothing logged")
        if post:
            lines.append(f"Post-workout: {post_cal} kcal · P{post_p}g ({'✓' if post_p >= 20 else '⚠ low'})")
        else:
            lines.append("Post-workout: nothing logged")

        assessment = NutrientTimingAssessment(
            pre_workout_protein_g=pre_p if pre else None,
            post_workout_protein_g=post_p if post else None,
            pre_window_ok=pre_p >= 20 if pre else False,
            post_window_ok=post_p >= 20 if post else False,
        )
        return "\n".join(lines), assessment
    except Exception:
        logger.exception("Failed to fetch yesterday's timing data")
        return "Timing data unavailable.", None


def _get_recent_meal_names(supabase_user_id: str, before_date: str, days: int = 3) -> str:
    """Fetch the last few days of logged meals so the coach can recommend variety."""
    try:
        sb = get_supabase()
        since = (date.fromisoformat(before_date) - timedelta(days=days)).isoformat()
        res = (
            sb.table("nutrition_diary")
            .select("date,meal_type,food_name")
            .eq("user_id", supabase_user_id)
            .gte("date", since)
            .lt("date", before_date)
            .neq("meal_type", "water")
            .order("date", desc=True)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return "No recent meals logged."
        return "\n".join(f"- {r['date']} {r['meal_type']}: {r['food_name']}" for r in rows)
    except Exception:
        logger.exception("Failed to fetch recent meal names")
        return "Recent meal history unavailable."


def _write_meal_recommendations(supabase_user_id: str | None, today_str: str, result: DailyCheckinOutput) -> None:
    """Upsert today's meal recommendations to Supabase."""
    if not supabase_user_id or not result.meal_recommendations:
        return
    try:
        sb = get_supabase()
        rows = [{
            "user_id": supabase_user_id,
            "date": today_str,
            "meal_type": m.meal_type,
            "name": m.name,
            "description": m.description,
            "ingredients": [ing.model_dump() for ing in m.ingredients],
            "calories": m.calories,
            "protein_g": m.protein_g,
            "carbs_g": m.carbs_g,
            "fat_g": m.fat_g,
            "fiber_g": m.fiber_g,
            "micros": m.micros.model_dump(),
            "source": "checkin",
            "updated_at": datetime.now().isoformat(),
        } for m in result.meal_recommendations]
        sb.table("nutrition_meal_recommendations").upsert(rows, on_conflict="user_id,date,meal_type").execute()
        logger.info("Wrote %d meal recommendation(s) for %s", len(rows), today_str)
    except Exception:
        logger.exception("Failed to write meal recommendations to Supabase")


def _write_nutrition_target(user_id: str | None, today_str: str, result: DailyCheckinOutput) -> None:
    """Upsert today's nutrition target to Supabase."""
    if not user_id or not result.nutrition_target:
        return
    nt = result.nutrition_target
    try:
        sb = get_supabase()
        sb.table("nutrition_daily_targets").upsert(
            {
                "user_id": user_id,
                "date": today_str,
                "calories": nt.calories,
                "protein_g": nt.protein_g,
                "carbs_g": nt.carbs_g,
                "fat_g": nt.fat_g,
                "fiber_g": nt.fiber_g,
                "water_ml": nt.water_ml,
                "workout_context": result.today_session,
                "notes": nt.notes,
                "source": "checkin",
                "updated_at": datetime.now().isoformat(),
            },
            on_conflict="user_id,date",
        ).execute()
        logger.info("Wrote nutrition daily target for %s: %d kcal", today_str, nt.calories)
    except Exception:
        logger.exception("Failed to write nutrition daily target to Supabase")


async def run_daily_checkin(
    user_id: str,
    athlete_name: str,
    yesterday_activities: list[dict[str, Any]],
    storage: FilePlanStorage | None = None,
    supabase_user_id: str | None = None,
) -> dict[str, Any]:
    """Run the daily check-in. Returns a result dict with today's briefing and updated schedule.

    `user_id` is the disk-storage namespace (FilePlanStorage) — leave as-is for the CLI's
    single-tenant `"cli_user"` default. `supabase_user_id`, if provided, is the real Supabase
    auth UUID used for Supabase-facing reads/writes (nutrition tables, athlete memory). When
    omitted, all Supabase-facing calls are skipped gracefully.
    """
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

    # Fetch yesterday's nutrient timing data (only on training days)
    yesterday_was_training = yesterday_plan and not yesterday_plan.get("is_rest")
    timing_context, timing_base = (
        _get_yesterday_timing(supabase_user_id, yesterday_str)
        if yesterday_was_training and supabase_user_id
        else ("Rest day — no timing windows to assess.", None)
    )

    # Athlete preferences/context and recent meal history (Supabase-facing, best-effort)
    athlete_memory = (
        get_athlete_memory(supabase_user_id) if supabase_user_id else None
    ) or "No athlete profile notes on file."
    recent_meals_context = (
        _get_recent_meal_names(supabase_user_id, today_str) if supabase_user_id
        else "Recent meal history unavailable."
    )
    meal_variety = get_meal_variety_preference(supabase_user_id) if supabase_user_id else "balanced"
    system_prompt = DAILY_CHECKIN_SYSTEM_PROMPT
    if meal_variety in ("minimal", "balanced"):
        system_prompt += (
            "\n- Reuse the same meal across multiple days this week rather than a new recipe every "
            "time, and favor ingredients already appearing in Recent Meals over new one-off ingredients."
        )

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
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": DAILY_CHECKIN_USER_PROMPT.format(
                today_date=today_str,
                today_day=today.strftime("%A"),
                scheduled_days_json=json.dumps(upcoming, indent=2),
                yesterday_activities_json=json.dumps(yesterday_activities, indent=2),
                season_plan_excerpt=_excerpt_season_plan(season_plan),
                yesterday_date=yesterday_str,
                yesterday_planned=yesterday_planned_desc,
                timing_context=timing_context,
                athlete_memory=athlete_memory,
                recent_meals_context=recent_meals_context,
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

    # Write per-day nutrition target and meal recommendations to Supabase
    _write_nutrition_target(supabase_user_id, today_str, result)
    _write_meal_recommendations(supabase_user_id, today_str, result)

    # Merge AI's timing note into the base assessment from raw diary data
    timing_result = None
    if timing_base is not None and result.nutrient_timing is not None:
        timing_result = NutrientTimingAssessment(
            pre_workout_protein_g=timing_base.pre_workout_protein_g,
            post_workout_protein_g=timing_base.post_workout_protein_g,
            pre_window_ok=timing_base.pre_window_ok,
            post_window_ok=timing_base.post_window_ok,
            note=result.nutrient_timing.note or "",
        )
    elif timing_base is not None:
        timing_result = timing_base

    return {
        "yesterday_status": result.yesterday_status,
        "yesterday_notes": result.yesterday_notes,
        "today_session": result.today_session,
        "today_focus": result.today_focus,
        "adjustments": result.adjustments,
        "summary_markdown": result.summary_markdown,
        "execution_time_seconds": execution_time,
        "nutrition_target": result.nutrition_target.model_dump() if result.nutrition_target else None,
        "nutrient_timing": timing_result.model_dump() if timing_result else None,
        "meal_recommendations": [m.model_dump() for m in result.meal_recommendations],
    }
