"""Write a completed replan to Supabase."""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta
from typing import Any

from .athlete_profile import get_weight_goal_direction
from .client import get_supabase

logger = logging.getLogger(__name__)


def write_report(
    *,
    analysis_html: str | None,
    planning_html: str | None,
    report_date: str | None = None,
    bench_e1rm_kg: float | None = None,
    predicted_5k_secs: int | None = None,
    max_heart_rate_bpm: int | None = None,
    kpis: dict | None = None,
    personal_records: list | None = None,
) -> str | None:
    """Persist the latest analysis/planning HTML reports. Returns the row UUID."""
    if not analysis_html and not planning_html:
        return None
    sb = get_supabase()
    user_id = _user_id()
    today = report_date or str(date.today())
    payload: dict = {
        "user_id": user_id,
        "report_date": today,
        "analysis_html": analysis_html or "",
        "planning_html": planning_html or "",
    }
    if bench_e1rm_kg is not None:
        payload["bench_e1rm_kg"] = bench_e1rm_kg
    if predicted_5k_secs is not None:
        payload["predicted_5k_secs"] = predicted_5k_secs
    if max_heart_rate_bpm is not None:
        payload["max_heart_rate_bpm"] = max_heart_rate_bpm
    if kpis is not None:
        payload["kpis"] = kpis
    if personal_records is not None:
        payload["personal_records"] = personal_records
    row = sb.table("analyses").insert(payload).execute()
    report_id = row.data[0]["id"]
    logger.info("📋 Report saved to Supabase (id=%s)", report_id)
    return report_id


def upsert_kpis(
    kpis: dict,
    personal_records: list | None = None,
    report_date: str | None = None,
) -> None:
    """Upsert a KPI snapshot for today. Creates a row if none exists for this date,
    otherwise updates only the kpis (and personal_records) columns in place."""
    sb = get_supabase()
    user_id = _user_id()
    today = report_date or str(date.today())

    existing = sb.table("analyses").select("id").eq("user_id", user_id).eq("report_date", today).limit(1).execute()
    if existing.data:
        row_id = existing.data[0]["id"]
        update: dict = {"kpis": kpis}
        if personal_records is not None:
            update["personal_records"] = personal_records
        sb.table("analyses").update(update).eq("id", row_id).execute()
        logger.info("📊 KPIs updated for %s (id=%s)", today, row_id)
    else:
        payload: dict = {
            "user_id": user_id,
            "report_date": today,
            "analysis_html": "",
            "planning_html": "",
            "kpis": kpis,
        }
        if personal_records is not None:
            payload["personal_records"] = personal_records
        row = sb.table("analyses").insert(payload).execute()
        logger.info("📊 KPIs inserted for %s (id=%s)", today, row.data[0]["id"])


def upsert_daily_metrics_batch(
    records: list[dict],
    user_id: str | None = None,
) -> int:
    """Upsert a list of per-day metric records into the daily_metrics table.

    Each record must have a ``date`` key (ISO string). Unknown extra keys are
    silently ignored — the DB schema is the source of truth.

    Returns the total number of rows written.
    """
    if not records:
        return 0
    sb = get_supabase()
    uid = user_id or _user_id()

    # Columns accepted by daily_metrics (everything else is dropped to avoid errors)
    ALLOWED = {
        "date", "ctl", "atl", "tsb", "acwr", "ramp_7d", "monotony", "strain",
        "vo2max_running", "vo2max_cycling",
        "rhr", "hrv_overnight", "sleep_score", "sleep_hours", "sleep_deep_h",
        "sleep_rem_h", "stress_avg", "body_battery", "weight_kg",
        "total_calories", "active_calories", "bmr_calories",
    }

    rows = []
    for rec in records:
        d = rec.get("date")
        if not d:
            continue
        clean = {k: v for k, v in rec.items() if k in ALLOWED and v is not None}
        clean["user_id"] = uid
        clean["date"] = d
        rows.append(clean)

    if not rows:
        return 0

    chunk = 100
    total = 0
    for i in range(0, len(rows), chunk):
        sb.table("daily_metrics").upsert(
            rows[i : i + chunk],
            on_conflict="user_id,date",
        ).execute()
        total += len(rows[i : i + chunk])

    logger.info("📊 daily_metrics: upserted %d rows", total)

    # Also sync weight entries to body_weight_log, skipping dates that have
    # a manual entry (so the user's manually-logged weight is never overwritten).
    weight_records = [
        {"date": r["date"], "weight_kg": r["weight_kg"]}
        for r in records
        if r.get("date") and r.get("weight_kg") is not None
    ]
    _sync_garmin_weight(sb, uid, weight_records)

    return total


def upsert_completed_activities(
    records: list[dict],
    user_id: str | None = None,
) -> int:
    """Upsert a list of completed-activity records into the completed_activities table.

    Each record must have ``activity_id`` and ``date`` keys. Unknown extra keys are
    silently ignored — the DB schema is the source of truth.

    Returns the total number of rows written.
    """
    if not records:
        return 0
    sb = get_supabase()
    uid = user_id or _user_id()

    ALLOWED = {
        "activity_id", "date", "activity_type", "activity_name", "duration_secs",
        "distance_meters", "avg_heart_rate", "max_heart_rate", "calories",
        "activity_training_load",
    }

    rows = []
    for rec in records:
        activity_id = rec.get("activity_id")
        d = rec.get("date")
        if not activity_id or not d:
            continue
        clean = {k: v for k, v in rec.items() if k in ALLOWED and v is not None}
        clean["user_id"] = uid
        rows.append(clean)

    if not rows:
        return 0

    chunk = 100
    total = 0
    for i in range(0, len(rows), chunk):
        sb.table("completed_activities").upsert(
            rows[i : i + chunk],
            on_conflict="user_id,activity_id",
        ).execute()
        total += len(rows[i : i + chunk])

    logger.info("🏃 completed_activities: upserted %d rows", total)
    return total


def get_scheduled_day(date_str: str) -> dict[str, Any] | None:
    """Return the scheduled_days row for a single date (from the athlete's live plan), or None if
    no plan covers that date. Used by the standalone daily nutrition job to look up today's planned
    session type — reads Supabase directly rather than the legacy local-file plan storage, since
    Supabase is the durable source of truth the rest of the pipeline already writes to."""
    sb = get_supabase()
    uid = _user_id()
    result = (
        sb.table("scheduled_days")
        .select("date, session_type, focus, description, is_key, is_rest")
        .eq("user_id", uid)
        .eq("date", date_str)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _day_type_for(day: dict[str, Any] | None) -> str:
    """Matches targets/generate/route.ts exactly: is_rest -> 'rest', is_key -> 'hard', else
    'easy'. 'default' (no plan for that date) is not a real day_type for expenditure-matching
    purposes — callers treat it as "no historical comparison available"."""
    if day is None:
        return "default"
    if day.get("is_rest"):
        return "rest"
    if day.get("is_key"):
        return "hard"
    return "easy"


def _estimate_active_calories(day_type: str, today_str: str) -> float | None:
    """Estimate today's active-calorie burn: use today's actual Garmin value if it's already
    accumulating something meaningful, otherwise average the athlete's own actual active_calories
    from the last ~12 weeks of days with the same day_type — grounded in real historical burn for
    this specific athlete and this specific kind of day, not a generic guess. Returns None if
    neither is available (too new an athlete, or day_type == "default")."""
    if day_type == "default":
        return None
    sb = get_supabase()
    uid = _user_id()

    today_metrics = (
        sb.table("daily_metrics").select("active_calories")
        .eq("user_id", uid).eq("date", today_str).maybe_single().execute()
    ).data
    if today_metrics and (today_metrics.get("active_calories") or 0) > 50:
        return float(today_metrics["active_calories"])

    since = (date.today() - timedelta(days=84)).isoformat()
    days = (
        sb.table("scheduled_days").select("date, is_key, is_rest")
        .eq("user_id", uid).gte("date", since).lt("date", today_str).execute()
    ).data or []
    matching_dates = [d["date"] for d in days if _day_type_for(d) == day_type]
    if not matching_dates:
        return None

    metrics = (
        sb.table("daily_metrics").select("active_calories")
        .eq("user_id", uid).in_("date", matching_dates).execute()
    ).data or []
    values = [m["active_calories"] for m in metrics if m.get("active_calories")]
    return sum(values) / len(values) if values else None


def _get_bmr_estimate(today_str: str) -> float | None:
    """Today's Garmin-estimated BMR if already synced, else the most recent available value —
    BMR is fairly stable day to day (mostly a function of body composition), so a slightly stale
    value is a reasonable stand-in for a day that hasn't synced yet."""
    sb = get_supabase()
    uid = _user_id()
    result = (
        sb.table("daily_metrics").select("date, bmr_calories")
        .eq("user_id", uid).lte("date", today_str)
        .not_.is_("bmr_calories", "null")
        .order("date", desc=True).limit(1).execute()
    )
    rows = result.data or []
    return float(rows[0]["bmr_calories"]) if rows else None


def _get_latest_weight_kg() -> float | None:
    sb = get_supabase()
    uid = _user_id()
    result = (
        sb.table("body_weight_log").select("weight_kg")
        .eq("user_id", uid).order("date", desc=True).limit(1).execute()
    )
    rows = result.data or []
    return float(rows[0]["weight_kg"]) if rows else None


def sync_todays_nutrition_target() -> dict[str, Any] | None:
    """Set today's nutrition_daily_targets row from actual estimated energy expenditure, not a
    flat lookup by day category — total calories = BMR + estimated active-calorie burn (today's
    real Garmin value once it's accumulating, else this athlete's own historical average for this
    day_type) + a deficit/surplus adjustment from the athlete's stated weight goal direction.
    Macros: protein at a fixed g/kg (needs don't vary much by day type — the "never drop the
    protein floor" principle), fat at 25% of calories, carbs filling the remainder — which means
    carbs naturally scale up on high-burn days and down on low-burn days, without a hardcoded
    per-day-type carb figure.

    Falls back to the flat nutrition_targets template (see the pre-2026-07-16 version of this
    function) whenever body weight, BMR, or an active-calorie estimate isn't available yet — e.g.
    a brand-new athlete with no body_weight_log or daily_metrics history. Pure Python/Supabase,
    no LLM call either way. Returns the written row, or None if even the fallback has nothing to
    work with.
    """
    sb = get_supabase()
    uid = _user_id()
    today_str = str(date.today())

    today = get_scheduled_day(today_str)
    day_type = _day_type_for(today)
    workout_context = (
        " · ".join(filter(None, [today.get("focus"), today.get("description")])) or None
        if today and day_type in ("hard", "easy") else None
    )

    weight_kg = _get_latest_weight_kg()
    bmr = _get_bmr_estimate(today_str)
    active_est = _estimate_active_calories(day_type, today_str)

    if weight_kg and bmr is not None and active_est is not None:
        tdee = bmr + active_est
        goal_direction = get_weight_goal_direction(uid)
        if goal_direction == "lose":
            calories = tdee - 400
        elif goal_direction == "gain":
            calories = tdee + 400
        else:
            calories = tdee

        protein_g = round(2.2 * weight_kg)
        fat_g = round(calories * 0.25 / 9)
        carbs_g = max(round((calories - protein_g * 4 - fat_g * 9) / 4), 0)
        fiber_g = round(calories / 1000 * 14)
        water_ml = round(35 * weight_kg) + (600 if day_type == "hard" else 300 if day_type == "easy" else 0)
        notes = (
            f"Estimated TDEE {round(tdee)} kcal (BMR {round(bmr)} + ~{round(active_est)} active) "
            f"for a {day_type} day, {goal_direction} adjustment applied."
        )
        row = {
            "user_id": uid, "date": today_str,
            "calories": round(calories), "protein_g": protein_g, "carbs_g": carbs_g,
            "fat_g": fat_g, "fiber_g": fiber_g, "water_ml": water_ml,
            "workout_context": workout_context, "notes": notes,
            "source": "planner", "updated_at": datetime.now().isoformat(),
        }
        sb.table("nutrition_daily_targets").upsert(row, on_conflict="user_id,date").execute()
        logger.info(
            "Synced data-driven nutrition target for %s (day_type=%s, TDEE=%.0f): %d kcal",
            today_str, day_type, tdee, row["calories"],
        )
        return row

    logger.info(
        "Insufficient data for a data-driven nutrition target (weight=%s, bmr=%s, active_est=%s) "
        "— falling back to the flat template.", weight_kg, bmr, active_est,
    )
    templates = (
        sb.table("nutrition_targets").select("*").eq("user_id", uid).execute()
    ).data or []
    lookup_type = day_type if day_type != "default" else "default"
    template = next((t for t in templates if t["day_type"] == lookup_type), None)
    if template is None:
        template = next((t for t in templates if t["day_type"] == "default"), None)
    if template is None:
        logger.warning("No nutrition_targets templates found for user %s — nothing to sync", uid)
        return None

    row = {
        "user_id": uid,
        "date": today_str,
        "calories": template["calories"],
        "protein_g": template["protein_g"],
        "carbs_g": template["carbs_g"],
        "fat_g": template["fat_g"],
        "fiber_g": template["fiber_g"],
        "water_ml": template["water_ml"],
        "workout_context": workout_context,
        "notes": template.get("notes"),
        "source": "planner",
        "updated_at": datetime.now().isoformat(),
    }
    sb.table("nutrition_daily_targets").upsert(row, on_conflict="user_id,date").execute()
    logger.info("Synced template nutrition target for %s (day_type=%s): %s kcal", today_str, lookup_type, template["calories"])
    return row


def get_planned_exercises_by_date(from_date: str, to_date: str) -> dict[str, list[dict[str, Any]]]:
    """Return {date: [exercise dicts sorted by display_order]} for every strength session in the
    given range. Used to match completed Garmin exercise sets back to what was actually planned —
    see build_completed_exercise_set_records() in services/garmin/history_sync.py.
    """
    sb = get_supabase()
    uid = _user_id()
    result = (
        sb.table("strength_sessions")
        .select("date, exercises(id, garmin_category, display_name, sets, reps_min, reps_max, display_order)")
        .eq("user_id", uid)
        .gte("date", from_date)
        .lte("date", to_date)
        .execute()
    )
    by_date: dict[str, list[dict[str, Any]]] = {}
    for row in (result.data or []):
        exercises = sorted(row.get("exercises") or [], key=lambda e: e.get("display_order", 0))
        by_date[row["date"]] = exercises
    return by_date


def upsert_completed_exercise_sets(
    records: list[dict],
    user_id: str | None = None,
) -> int:
    """Upsert matched completed-set records into completed_exercise_sets.

    Each record must have ``date``, ``exercise_id``, and ``set_index`` keys — the three together
    form the idempotency key, so re-running a sync over the same range doesn't create duplicates.
    """
    if not records:
        return 0
    sb = get_supabase()
    uid = user_id or _user_id()

    ALLOWED = {
        "date", "exercise_id", "display_name", "garmin_category", "set_index", "reps",
        "weight_kg", "prescribed_reps_min", "prescribed_reps_max",
    }

    rows = []
    for rec in records:
        if not rec.get("date") or not rec.get("exercise_id") or rec.get("set_index") is None:
            continue
        clean = {k: v for k, v in rec.items() if k in ALLOWED and v is not None}
        clean["user_id"] = uid
        rows.append(clean)

    if not rows:
        return 0

    chunk = 100
    total = 0
    for i in range(0, len(rows), chunk):
        sb.table("completed_exercise_sets").upsert(
            rows[i : i + chunk],
            on_conflict="user_id,date,exercise_id,set_index",
        ).execute()
        total += len(rows[i : i + chunk])

    logger.info("🏋️ completed_exercise_sets: upserted %d rows", total)
    return total


def _sync_garmin_weight(sb, uid: str, weight_records: list[dict]) -> None:
    """Upsert Garmin-sourced weight entries, never overwriting manual entries."""
    if not weight_records:
        return

    dates = [r["date"] for r in weight_records]

    # Fetch existing entries to protect manual ones
    existing_resp = (
        sb.table("body_weight_log")
        .select("date, source")
        .eq("user_id", uid)
        .in_("date", dates)
        .execute()
    )
    manual_dates = {
        row["date"]
        for row in (existing_resp.data or [])
        if row.get("source") == "manual"
    }

    rows = [
        {"user_id": uid, "date": r["date"], "weight_kg": r["weight_kg"], "source": "garmin"}
        for r in weight_records
        if r["date"] not in manual_dates
    ]
    if not rows:
        return

    sb.table("body_weight_log").upsert(rows, on_conflict="user_id,date").execute()
    logger.info("⚖️  body_weight_log: synced %d Garmin weight entries", len(rows))


def write_weekly_review(
    *,
    week_start: str,
    summary_html: str,
    kpi_delta: dict | None = None,
    user_id: str | None = None,
) -> None:
    """Upsert a weekly review for the given week (Monday ISO date).

    Called at the end of each weekly check-in. ``week_start`` must be the
    Monday of the reviewed week (e.g. "2026-06-23"). Subsequent calls for the
    same week overwrite the previous review.
    """
    sb = get_supabase()
    uid = user_id or _user_id()
    payload: dict = {
        "user_id": uid,
        "week_start": week_start,
        "summary_html": summary_html,
        "updated_at": "now()",
    }
    if kpi_delta is not None:
        payload["kpi_delta"] = kpi_delta
    sb.table("weekly_reviews").upsert(payload, on_conflict="user_id,week_start").execute()
    logger.info("📝 Weekly review saved for week %s", week_start)


def _user_id() -> str:
    uid = os.environ.get("SUPABASE_USER_ID", "")
    if not uid:
        raise RuntimeError("SUPABASE_USER_ID not set in environment. "
                           "Copy your user UUID from Supabase Auth → Users.")
    return uid


def get_future_garmin_workout_ids(from_date: str) -> dict[str, dict[str, Any]]:
    """Return {date: {"workout_id": id}} for every currently-stored strength session (from
    whatever plan is live right now, regardless of which run created it) with a Garmin workout
    scheduled on/after from_date.

    Call this BEFORE write_plan() — write_plan() cascade-deletes the old plan's strength_sessions
    rows, which is the only place these IDs are durably recorded. The CLI previously tracked
    pushed workout IDs in a local JSON file instead, but that file and Supabase are two
    independent writes with no transaction between them (write_plan() logs a warning and
    continues if the Supabase write fails), so they can silently diverge — leaving orphaned
    workouts on the watch that never get cleaned up on a later run. Supabase is queried fresh
    here instead, since it's the durable record every write ultimately lands in.
    """
    sb = get_supabase()
    user_id = _user_id()
    result = (
        sb.table("strength_sessions")
        .select("date, garmin_workout_id")
        .eq("user_id", user_id)
        .gte("date", from_date)
        .not_.is_("garmin_workout_id", "null")
        .execute()
    )
    return {row["date"]: {"workout_id": row["garmin_workout_id"]} for row in (result.data or [])}


def _estimate_session_duration_secs(exercises: list[dict[str, Any]]) -> int:
    """Rough session length from the athlete's fixed 3-min-rest-between-every-set rule, plus a
    small per-set work allowance and a fixed warm-up/transition buffer."""
    total = 300  # warm-up + transitions between exercises
    for ex in exercises:
        sets = ex.get("sets") or 0
        rest = ex.get("rest_seconds") or 180
        total += sets * (rest + 30)  # ~30s of actual lifting per working set
    return total


_SLOT_ROTATION = ["A", "B", "C"]


def get_next_strength_slot() -> str:
    """Return the slot that should follow whatever was most recently scheduled, continuing the
    fixed A -> B -> C -> A ... rotation. Defaults to "A" if the athlete has no strength session
    history yet."""
    sb = get_supabase()
    user_id = _user_id()
    result = (
        sb.table("strength_sessions").select("slot")
        .eq("user_id", user_id).order("date", desc=True).limit(1).execute()
    )
    rows = result.data or []
    last_slot = rows[0]["slot"] if rows else None
    if last_slot not in _SLOT_ROTATION:
        return "A"
    return _SLOT_ROTATION[(_SLOT_ROTATION.index(last_slot) + 1) % 3]


def expand_strength_session_slots(slot_assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Expand {date, slot} pairs — what the weekly planner now decides for strength sessions —
    into full StrengthSessionData-shaped dicts (date, name, slot, exercises,
    estimated_duration_secs), using the athlete's saved strength_session_templates for exercise
    identity/order/sets/reps and compute_bench_prescription() for the one dynamic (barbell bench)
    row per session.

    The LLM decides which calendar dates get a strength session (a real judgment call — recovery
    spacing, proximity to hard runs) but the slot LETTER on each date is always recomputed here by
    strictly continuing the A -> B -> C rotation from the athlete's last scheduled session — the
    LLM's own `slot` guess is only used for its spacing reasoning while generating and is
    discarded/overridden here, so a mislabeled rotation can never actually reach Supabase or Garmin.

    The LLM no longer authors exercise content at all for strength sessions — call this before
    write_plan() so its `strength_sessions` argument is these fully-expanded dicts, not raw LLM
    output.
    """
    from .bench_wave import compute_bench_prescription

    sb = get_supabase()
    user_id = _user_id()

    ordered = sorted(
        (a for a in slot_assignments if a.get("date")),
        key=lambda a: a["date"],
    )
    next_slot = get_next_strength_slot()
    corrected_slots: dict[str, str] = {}
    for assignment in ordered:
        corrected_slots[assignment["date"]] = next_slot
        if assignment.get("slot") != next_slot:
            logger.warning(
                "Strength rotation correction: %s was labeled %r by the planner, forcing %r to "
                "continue the A->B->C rotation",
                assignment["date"], assignment.get("slot"), next_slot,
            )
        next_slot = _SLOT_ROTATION[(_SLOT_ROTATION.index(next_slot) + 1) % 3]

    templates = (
        sb.table("strength_session_templates").select("*")
        .eq("user_id", user_id).order("slot").order("display_order").execute()
    ).data or []
    by_slot: dict[str, list[dict[str, Any]]] = {}
    for row in templates:
        by_slot.setdefault(row["slot"], []).append(row)

    profile = (
        sb.table("athlete_profile").select("bench_wave_start_date")
        .eq("user_id", user_id).maybe_single().execute()
    ).data or {}
    wave_start_str = profile.get("bench_wave_start_date")

    sessions: list[dict[str, Any]] = []
    for session_date_str, slot in corrected_slots.items():
        rows = by_slot.get(slot)
        if not rows:
            logger.warning("No strength_session_templates rows for slot %r on %s — skipping", slot, session_date_str)
            continue
        session_date = date.fromisoformat(session_date_str)
        wave_start = date.fromisoformat(wave_start_str) if wave_start_str else session_date

        exercises = []
        for row in rows:
            if row["is_dynamic_bench"]:
                prescription = compute_bench_prescription(session_date, wave_start)
                sets, reps_min, reps_max, rir = (
                    prescription["sets"], prescription["reps_min"], prescription["reps_max"], prescription["rir"],
                )
            else:
                sets, reps_min, reps_max, rir = row["sets"], row["reps_min"], row["reps_max"], row["rir"]
            exercises.append({
                "garmin_category": row["garmin_category"],
                "garmin_exercise_key": row["garmin_exercise_key"],
                "display_name": row["display_name"],
                "sets": sets,
                "reps_min": reps_min,
                "reps_max": reps_max,
                "rest_seconds": row["rest_seconds"],
                "rir": rir,
            })

        sessions.append({
            "date": session_date_str,
            "name": f"Strength {slot} - {rows[0]['slot_name']}",
            "slot": slot,
            "slot_name": rows[0]["slot_name"],
            "exercises": exercises,
            "estimated_duration_secs": _estimate_session_duration_secs(exercises),
        })
    return sessions


def write_plan(
    *,
    markdown: str,
    scheduled_days: list[dict[str, Any]],
    strength_sessions: list[dict[str, Any]],
    garmin_workout_ids: dict[str, dict[str, Any]],
) -> str:
    """Persist a full replan to Supabase. Returns the new plan UUID."""
    sb = get_supabase()
    user_id = _user_id()

    # Infer horizon from scheduled_days
    dates = [d["date"] for d in scheduled_days if d.get("date")]
    start_date = min(dates) if dates else str(date.today())
    end_date = max(dates) if dates else str(date.today() + timedelta(days=27))

    # ── Insert plan ──────────────────────────────────────────────────────────
    plan_row = sb.table("plans").insert({
        "user_id": user_id,
        "start_date": start_date,
        "end_date": end_date,
        "markdown": markdown,
    }).execute()
    plan_id = plan_row.data[0]["id"]
    logger.info("Created plan %s (%s → %s)", plan_id, start_date, end_date)

    # ── Delete previous plan's data for the same horizon ────────────────────
    # Keep only the most recent plan active by deleting older rows for
    # overlapping date ranges. Cascade deletes handle child tables.
    # Standard interval-overlap check (old.start <= new.end AND old.end >= new.start) —
    # NOT full-containment, which previously missed any older plan whose start_date
    # predated this one (e.g. an original full-season plan later narrowed by replans),
    # leaving its scheduled_days/strength_sessions rows to coexist with the new plan's
    # for the same calendar dates.
    sb.table("plans").delete().neq("id", plan_id).eq("user_id", user_id).lte(
        "start_date", end_date
    ).gte("end_date", start_date).execute()

    # ── Insert scheduled_days ────────────────────────────────────────────────
    if scheduled_days:
        sb.table("scheduled_days").insert([
            {
                "plan_id": plan_id,
                "user_id": user_id,
                "date": d["date"],
                "session_type": d.get("session_type", "rest"),
                "focus": d.get("focus", ""),
                "description": d.get("description", ""),
                "is_key": d.get("is_key_session", False),
                "is_rest": d.get("is_rest", False),
            }
            for d in scheduled_days
        ]).execute()
        logger.info("Inserted %d scheduled days", len(scheduled_days))

    # ── Insert strength sessions + exercises ─────────────────────────────────
    session_count = 0
    exercise_count = 0
    for s in strength_sessions:
        session_date = s["date"]
        garmin_id = garmin_workout_ids.get(session_date, {}).get("workout_id")

        session_row = sb.table("strength_sessions").insert({
            "plan_id": plan_id,
            "user_id": user_id,
            "date": session_date,
            "name": s["name"],
            "slot": s.get("slot"),
            "garmin_workout_id": garmin_id,
            "estimated_duration_secs": s.get("estimated_duration_secs", 3600),
        }).execute()
        session_id = session_row.data[0]["id"]
        session_count += 1

        exercises = s.get("exercises", [])
        if exercises:
            sb.table("exercises").insert([
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "display_order": i,
                    "garmin_category": ex.get("garmin_category"),
                    "garmin_exercise_key": ex.get("garmin_exercise_key"),
                    "display_name": ex["display_name"],
                    "sets": ex["sets"],
                    "reps_min": ex["reps_min"],
                    "reps_max": ex["reps_max"],
                    "rest_seconds": ex.get("rest_seconds", 180),
                    "rir": ex.get("rir"),
                }
                for i, ex in enumerate(exercises)
            ]).execute()
            exercise_count += len(exercises)

    logger.info("Inserted %d sessions, %d exercises", session_count, exercise_count)
    return plan_id
