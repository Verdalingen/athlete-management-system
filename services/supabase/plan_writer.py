"""Write a completed replan to Supabase."""
from __future__ import annotations

import html as _html
import logging
import os
from datetime import UTC, date, datetime, timedelta
from typing import Any

from .athlete_profile import get_weight_goal_direction
from .client import get_supabase, row, rows

logger = logging.getLogger(__name__)


def write_report(
    *,
    analysis_html: str | None,
    planning_html: str | None,
    report_date: str | None = None,
    bench_e1rm_kg: float | None = None,
    predicted_5k_secs: int | None = None,
    predicted_10k_secs: int | None = None,
    predicted_half_marathon_secs: int | None = None,
    predicted_marathon_secs: int | None = None,
    max_heart_rate_bpm: int | None = None,
    kpis: dict | None = None,
    personal_records: list | None = None,
) -> str | None:
    """Persist the latest analysis/planning HTML reports. Returns the row UUID.

    Upserts onto the same report_date row upsert_kpis() creates/updates rather than
    always inserting — a blind insert here used to create a second `analyses` row
    for the same date whenever both this and upsert_kpis() ran the same day (e.g. a
    morning sync-kpis cron followed by a same-day Check-In), leaving the web dashboard
    to nondeterministically pick whichever of the two rows a plain `.limit(1)` query
    happened to return — confirmed live: one such duplicate had every kpis.* field
    null, causing the dashboard's readiness pills to intermittently vanish.
    """
    if not analysis_html and not planning_html:
        return None
    sb = get_supabase()
    user_id = _user_id()
    today = report_date or str(date.today())

    fields: dict = {}
    if analysis_html is not None:
        fields["analysis_html"] = analysis_html
    if planning_html is not None:
        fields["planning_html"] = planning_html
    if bench_e1rm_kg is not None:
        fields["bench_e1rm_kg"] = bench_e1rm_kg
    if predicted_5k_secs is not None:
        fields["predicted_5k_secs"] = predicted_5k_secs
    if predicted_10k_secs is not None:
        fields["predicted_10k_secs"] = predicted_10k_secs
    if predicted_half_marathon_secs is not None:
        fields["predicted_half_marathon_secs"] = predicted_half_marathon_secs
    if predicted_marathon_secs is not None:
        fields["predicted_marathon_secs"] = predicted_marathon_secs
    if max_heart_rate_bpm is not None:
        fields["max_heart_rate_bpm"] = max_heart_rate_bpm
    if kpis is not None:
        fields["kpis"] = kpis
    if personal_records is not None:
        fields["personal_records"] = personal_records
    fields["updated_at"] = datetime.now(UTC).isoformat()

    existing = rows(sb.table("analyses").select("id").eq("user_id", user_id).eq("report_date", today).order("updated_at", desc=True).limit(1).execute())
    if existing:
        report_id = existing[0]["id"]
        sb.table("analyses").update(fields).eq("id", report_id).execute()
        logger.info("📋 Report updated in Supabase (id=%s)", report_id)
    else:
        # Fresh row for this date — analysis_html/planning_html always present (insert-only
        # NOT NULL columns), same coercion the old unconditional insert used.
        payload = {
            "user_id": user_id, "report_date": today,
            "analysis_html": analysis_html or "", "planning_html": planning_html or "",
            **{k: v for k, v in fields.items() if k not in ("analysis_html", "planning_html")},
        }
        inserted = rows(sb.table("analyses").insert(payload).execute())
        report_id = inserted[0]["id"]
        logger.info("📋 Report saved to Supabase (id=%s)", report_id)
    return report_id


def upsert_kpis(
    kpis: dict,
    personal_records: list | None = None,
    report_date: str | None = None,
    predicted_5k_secs: int | None = None,
    predicted_10k_secs: int | None = None,
    predicted_half_marathon_secs: int | None = None,
    predicted_marathon_secs: int | None = None,
) -> None:
    """Upsert a KPI snapshot for today. Creates a row if none exists for this date,
    otherwise updates only the kpis (and personal_records) columns in place.

    The four predicted_*_secs kwargs are optional because they come from Garmin's
    race predictor, which — unlike bench e1RM (needs per-set activity detail only the
    full Check-In extraction fetches) — is a single cheap API call already made on
    every extraction regardless of config. Accepting them here (not just in
    write_report()) means the lightweight, frequent KPI-sync path can populate these
    dedicated trend columns too, instead of only getting one data point per weekly
    Check-In — a real fix for the dashboard's evolution charts having too few points
    to render most race distances.
    """
    sb = get_supabase()
    user_id = _user_id()
    today = report_date or str(date.today())

    # Explicitly UTC-aware — datetime.now().isoformat() (naive, local system time)
    # gets misinterpreted as already-UTC by Postgres, silently skewing this by the
    # local UTC offset (verified live: a CEST run showed as 2h ahead of true UTC,
    # breaking the web dashboard's "last synced Xh ago" freshness display).
    now = datetime.now(UTC).isoformat()

    race_fields: dict = {}
    if predicted_5k_secs is not None:
        race_fields["predicted_5k_secs"] = predicted_5k_secs
    if predicted_10k_secs is not None:
        race_fields["predicted_10k_secs"] = predicted_10k_secs
    if predicted_half_marathon_secs is not None:
        race_fields["predicted_half_marathon_secs"] = predicted_half_marathon_secs
    if predicted_marathon_secs is not None:
        race_fields["predicted_marathon_secs"] = predicted_marathon_secs

    existing = rows(sb.table("analyses").select("id").eq("user_id", user_id).eq("report_date", today).limit(1).execute())
    if existing:
        row_id = existing[0]["id"]
        update: dict = {"kpis": kpis, "updated_at": now, **race_fields}
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
            "updated_at": now,
            **race_fields,
        }
        if personal_records is not None:
            payload["personal_records"] = personal_records
        inserted = rows(sb.table("analyses").insert(payload).execute())
        logger.info("📊 KPIs inserted for %s (id=%s)", today, inserted[0]["id"])


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
        # Sickness Watch signals (see web/DESIGN.md)
        "respiration_avg", "sleep_stress_avg", "body_battery_overnight_gain",
        # Dense daily race-time predictions (Garmin recomputes these every day —
        # unlike bench e1RM, which stays on analyses since it's check-in-sparse)
        "predicted_5k_secs", "predicted_10k_secs", "predicted_half_marathon_secs", "predicted_marathon_secs",
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
    Supabase is the durable source of truth the rest of the pipeline already writes to.
    """
    sb = get_supabase()
    uid = _user_id()
    found = rows(
        sb.table("scheduled_days")
        .select("date, session_type, focus, description, is_key, is_rest, running_segments")
        .eq("user_id", uid)
        .eq("date", date_str)
        .limit(1)
        .execute()
    )
    return found[0] if found else None


def _day_type_for(day: dict[str, Any] | None) -> str:
    """Matches targets/generate/route.ts exactly: is_rest -> 'rest', is_key -> 'hard', else
    'easy'. 'default' (no plan for that date) is not a real day_type for expenditure-matching
    purposes — callers treat it as "no historical comparison available".
    """
    if day is None:
        return "default"
    if day.get("is_rest"):
        return "rest"
    if day.get("is_key"):
        return "hard"
    return "easy"


_RUNNING_KCAL_PER_KG_PER_KM = 1.0  # standard running-economy estimate — ~pace-independent
_STRENGTH_MET = 6.0                # ACSM compendium: resistance training, multiple exercises, vigorous effort
_MET_TO_KCAL_PER_KG_PER_MIN = 3.5 / 200  # MET -> kcal/kg/min conversion


def _pace_to_mps(pace: str) -> float:
    """'M:SS' per km -> meters/second."""
    mins_str, secs_str = pace.split(":")
    return 1000.0 / (int(mins_str) * 60 + int(secs_str))


def _running_distance_km(segments: list[dict[str, Any]]) -> float:
    """Total planned distance across a running session's segments.

    Segments set distance_meters directly (interval reps, steady-state by distance), or
    duration_secs + a pace_low/pace_high band (steady-state by time) — for those, distance is
    estimated from the midpoint pace.
    """
    total_m = 0.0
    for seg in segments:
        distance = seg.get("distance_meters")
        if distance:
            total_m += float(distance) * (seg.get("repeat_count") or 1)
            continue
        duration = seg.get("duration_secs")
        pace_low, pace_high = seg.get("pace_low"), seg.get("pace_high")
        if duration and pace_low and pace_high:
            mps = (_pace_to_mps(pace_low) + _pace_to_mps(pace_high)) / 2
            total_m += mps * float(duration) * (seg.get("repeat_count") or 1)
    return total_m / 1000.0


def _get_strength_duration_secs(date_str: str) -> int | None:
    sb = get_supabase()
    uid = _user_id()
    found = rows(
        sb.table("strength_sessions").select("estimated_duration_secs")
        .eq("user_id", uid).eq("date", date_str).limit(1).execute()
    )
    return found[0]["estimated_duration_secs"] if found else None


def _estimate_session_calories(today: dict[str, Any] | None, weight_kg: float) -> float | None:
    """Estimate today's active-calorie burn from the actual session on the plan today.

    Not a same-bucket historical average — so two "hard" days with very different sessions (a
    heavy squat day vs. a 15km tempo run) get different estimates. Strength uses a MET-based formula
    scaled by planned duration; running uses distance (planned directly, or derived from
    duration + target pace) at a fixed kcal/kg/km rate. Returns None when there isn't enough
    session data to estimate from (rest days, or a cross/race placeholder with no duration or
    distance recorded yet) — callers fall back to the historical day-type average in that case.
    """
    if today is None or today.get("is_rest"):
        return None

    session_type = today.get("session_type")
    if session_type == "strength":
        duration_secs = _get_strength_duration_secs(today["date"])
        if not duration_secs:
            return None
        return _STRENGTH_MET * _MET_TO_KCAL_PER_KG_PER_MIN * weight_kg * (duration_secs / 60)

    if session_type == "run":
        km = _running_distance_km(today.get("running_segments") or [])
        if km <= 0:
            return None
        return _RUNNING_KCAL_PER_KG_PER_KM * weight_kg * km

    return None


def _estimate_active_calories(
    day_type: str, today_str: str, today: dict[str, Any] | None, weight_kg: float | None,
) -> float | None:
    """Estimate today's active-calorie burn, preferring the most grounded source available.

    (1) today's actual Garmin value, once it's accumulating something meaningful: (2) a
    session-specific estimate from the plan's actual duration/distance for today, via
    _estimate_session_calories(); (3) the athlete's own historical active_calories average from
    the last ~12 weeks of days with the same day_type, for days without enough session detail to
    estimate from (rest days, or a placeholder session with no duration yet). Returns None if
    nothing is available (too new an athlete, or day_type == "default").
    """
    if day_type == "default":
        return None
    sb = get_supabase()
    uid = _user_id()

    today_metrics = row(
        sb.table("daily_metrics").select("active_calories")
        .eq("user_id", uid).eq("date", today_str).maybe_single().execute()
    )
    if today_metrics and (today_metrics.get("active_calories") or 0) > 50:
        return float(today_metrics["active_calories"])

    if weight_kg:
        session_est = _estimate_session_calories(today, weight_kg)
        if session_est is not None:
            return session_est

    since = (date.today() - timedelta(days=84)).isoformat()
    days = rows(
        sb.table("scheduled_days").select("date, is_key, is_rest")
        .eq("user_id", uid).gte("date", since).lt("date", today_str).execute()
    )
    matching_dates = [d["date"] for d in days if _day_type_for(d) == day_type]
    if not matching_dates:
        return None

    metrics = rows(
        sb.table("daily_metrics").select("active_calories")
        .eq("user_id", uid).in_("date", matching_dates).execute()
    )
    values = [m["active_calories"] for m in metrics if m.get("active_calories")]
    return sum(values) / len(values) if values else None


def _get_bmr_estimate(today_str: str) -> float | None:
    """Most recent *complete* day's Garmin-estimated BMR — always strictly before today.

    Garmin's bmr_calories for the current, still-running day is a cumulative intraday
    reading, not a finalized daily total: confirmed live it read 971 kcal at ~10:45am
    against a stable ~2429 on every complete prior day, because the morning sync-kpis
    cron (see cli/garmin_ai_coach_cli.py) ran hours before Garmin finished attributing
    the day's rest calories. Since BMR barely changes day to day, a stale-but-complete
    reading from yesterday is strictly more accurate than today's still-partial one —
    so today's own row is never used here even once it's non-null.
    """
    sb = get_supabase()
    uid = _user_id()
    found = rows(
        sb.table("daily_metrics").select("date, bmr_calories")
        .eq("user_id", uid).lt("date", today_str)
        .not_.is_("bmr_calories", "null")
        .order("date", desc=True).limit(1).execute()
    )
    return float(found[0]["bmr_calories"]) if found else None


def _get_latest_weight_kg() -> float | None:
    sb = get_supabase()
    uid = _user_id()
    found = rows(
        sb.table("body_weight_log").select("weight_kg")
        .eq("user_id", uid).order("date", desc=True).limit(1).execute()
    )
    return float(found[0]["weight_kg"]) if found else None


def sync_todays_nutrition_target() -> dict[str, Any] | None:
    """Set today's nutrition_daily_targets row from actual estimated energy expenditure, not a
    flat lookup by day category — total calories = BMR (passive burn) + estimated active-calorie
    burn from today's actual planned session (today's real Garmin value once it's accumulating,
    else a duration/distance-based estimate for the specific session on the plan today, else this
    athlete's own historical average for this day_type — see _estimate_active_calories()) + a
    deficit/surplus adjustment from the athlete's stated weight goal direction. Macros: protein at
    a fixed g/kg (needs don't vary much by day type — the "never drop the protein floor"
    principle), fat at 25% of calories, carbs filling the remainder — which means carbs naturally
    scale up on high-burn days and down on low-burn days, without a hardcoded per-day-type carb
    figure.

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
    active_est = _estimate_active_calories(day_type, today_str, today, weight_kg)

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
        row: dict[str, Any] = {
            "user_id": uid, "date": today_str,
            "calories": round(calories), "protein_g": protein_g, "carbs_g": carbs_g,
            "fat_g": fat_g, "fiber_g": fiber_g, "water_ml": water_ml,
            "workout_context": workout_context, "notes": notes,
            "source": "planner", "updated_at": datetime.now(UTC).isoformat(),
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
    templates = rows(
        sb.table("nutrition_targets").select("*").eq("user_id", uid).execute()
    )
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
        "updated_at": datetime.now(UTC).isoformat(),
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
    result = rows(
        sb.table("strength_sessions")
        .select("date, exercises(id, garmin_category, display_name, sets, reps_min, reps_max, display_order)")
        .eq("user_id", uid)
        .gte("date", from_date)
        .lte("date", to_date)
        .execute()
    )
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in result:
        exercises = sorted(r.get("exercises") or [], key=lambda e: e.get("display_order", 0))
        by_date[r["date"]] = exercises
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
    existing_rows = rows(
        sb.table("body_weight_log")
        .select("date, source")
        .eq("user_id", uid)
        .in_("date", dates)
        .execute()
    )
    manual_dates = {
        r["date"]
        for r in existing_rows
        if r.get("source") == "manual"
    }

    to_upsert = [
        {"user_id": uid, "date": r["date"], "weight_kg": r["weight_kg"], "source": "garmin"}
        for r in weight_records
        if r["date"] not in manual_dates
    ]
    if not to_upsert:
        return

    sb.table("body_weight_log").upsert(to_upsert, on_conflict="user_id,date").execute()
    logger.info("⚖️  body_weight_log: synced %d Garmin weight entries", len(to_upsert))


def monday_of(d: date | str) -> str:
    """Monday (ISO date string) of the week containing `d` — the `week_start` key
    weekly_reviews is unique on.
    """
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return (d - timedelta(days=d.weekday())).isoformat()


def _split_insight_label(item: str) -> tuple[str | None, str]:
    """Split a leading "Short label: body" prefix out of a feedback line, so the UI can
    show it as a heading. Returns (label, body) or (None, item) when there's no clean
    prefix — guards keep it from firing on a mid-sentence colon (a real label is short,
    and won't contain sentence punctuation).
    """
    label, sep, rest = item.partition(":")
    rest = rest.strip()
    if not sep or not rest or len(label) > 24 or any(c in label for c in ".,(;"):
        return None, item
    return label.strip(), rest


def render_coach_feedback_html(coach_feedback: str) -> str:
    """Convert the weekly planner's plain-text `coach_feedback` into the HTML the
    Progress page's "This week" tab renders.

    coach_feedback is LLM-authored free text (per WeeklyPlanOutput's schema: "3-4 bullet
    points covering what the Garmin data shows..."), newline-separated, optionally prefixed
    with "-" or "⚠️". The frontend injects summary_html via dangerouslySetInnerHTML, so every
    piece of model text is HTML-escaped here and only the wrapper markup is ours — never pass
    model output through as raw HTML.

    Each line becomes its own `.insight` card rather than a run-on bullet, since these are
    genuinely separate assessments (observation / adjustment / thing to watch) and read as a
    wall of text otherwise. Warning styling keys off the "⚠️" prefix, which is deterministic
    — it's emitted by our own post-generation checks in weekly_planner_node.py, not guessed
    from the model's wording — plus an explicit "Watch item"/"Caution" label, which the
    schema tells the model to produce. Anything unrecognized gets the neutral treatment.
    """
    lines = [ln.strip() for ln in (coach_feedback or "").splitlines()]
    items = [ln.lstrip("-•").strip() for ln in lines if ln.strip()]
    if not items:
        return ""

    out = ['<ul class="insight-list">']
    for item in items:
        label, body = _split_insight_label(item)
        is_warn = item.startswith("⚠") or (
            label is not None and label.lower() in ("watch item", "watch", "caution", "warning")
        )
        cls = "insight insight-warn" if is_warn else "insight"
        inner = _html.escape(body)
        if label is not None:
            inner = f'<span class="insight-label">{_html.escape(label)}</span>{inner}'
        out.append(f'<li class="{cls}">{inner}</li>')
    out.append("</ul>")
    return "".join(out)


# Metrics summarized in a weekly review's kpi_delta, and whether a rise is an improvement.
# (None = direction isn't inherently good or bad, so the UI shows it uncolored — same
# no-editorializing stance DESIGN.md settled on for DeltaBadge.)
_WEEKLY_DELTA_METRICS: dict[str, bool | None] = {
    "ctl": True, "atl": None, "tsb": None,
    "hrv_overnight": True, "rhr": False, "sleep_hours": True,
}


def compute_weekly_kpi_delta(week_start: str, user_id: str | None = None) -> dict:
    """Average each tracked metric over the review week vs. the week before it.

    Returns {metric: {"current": x, "prior": y, "delta": x - y, "higher_is_better": bool|None}},
    skipping any metric with no data on either side. Averaged (not last-value) so one noisy
    night doesn't define the week.
    """
    sb = get_supabase()
    uid = user_id or _user_id()
    start = date.fromisoformat(week_start)
    prior_start = start - timedelta(days=7)
    cols = ", ".join(["date", *_WEEKLY_DELTA_METRICS])
    metric_rows = rows(
        sb.table("daily_metrics").select(cols)
        .eq("user_id", uid)
        .gte("date", prior_start.isoformat())
        .lte("date", (start + timedelta(days=6)).isoformat())
        .execute()
    )

    def avg(metric: str, lo: date, hi: date) -> float | None:
        vals = [
            float(r[metric]) for r in metric_rows
            if r.get(metric) is not None and lo <= date.fromisoformat(r["date"]) <= hi
        ]
        return sum(vals) / len(vals) if vals else None

    delta: dict = {}
    for metric, higher_is_better in _WEEKLY_DELTA_METRICS.items():
        current = avg(metric, start, start + timedelta(days=6))
        prior = avg(metric, prior_start, start - timedelta(days=1))
        if current is None or prior is None:
            continue
        delta[metric] = {
            "current": round(current, 1),
            "prior": round(prior, 1),
            "delta": round(current - prior, 1),
            "higher_is_better": higher_is_better,
        }
    return delta


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
    result = rows(
        sb.table("strength_sessions")
        .select("date, garmin_workout_id")
        .eq("user_id", user_id)
        .gte("date", from_date)
        .not_.is_("garmin_workout_id", "null")
        .execute()
    )
    return {r["date"]: {"workout_id": r["garmin_workout_id"]} for r in result}


def get_future_garmin_running_workout_ids(from_date: str) -> dict[str, dict[str, Any]]:
    """Return {date: {"workout_id": id}} for every currently-stored 'run' scheduled_days row with
    a Garmin workout scheduled on/after from_date. Mirrors get_future_garmin_workout_ids() above —
    call this BEFORE write_plan() for the same reason (write_plan() replaces scheduled_days rows).
    """
    sb = get_supabase()
    user_id = _user_id()
    result = rows(
        sb.table("scheduled_days")
        .select("date, garmin_workout_id")
        .eq("user_id", user_id)
        .eq("session_type", "run")
        .gte("date", from_date)
        .not_.is_("garmin_workout_id", "null")
        .execute()
    )
    return {r["date"]: {"workout_id": r["garmin_workout_id"]} for r in result}


def _estimate_session_duration_secs(exercises: list[dict[str, Any]]) -> int:
    """Rough session length from the athlete's fixed 3-min-rest-between-every-set rule, plus a
    small per-set work allowance and a fixed warm-up/transition buffer.
    """
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
    history yet.
    """
    sb = get_supabase()
    user_id = _user_id()
    found = rows(
        sb.table("strength_sessions").select("slot")
        .eq("user_id", user_id).order("date", desc=True).limit(1).execute()
    )
    last_slot = found[0]["slot"] if found else None
    if last_slot not in _SLOT_ROTATION:
        return "A"
    return _SLOT_ROTATION[(_SLOT_ROTATION.index(last_slot) + 1) % 3]


def get_sync_gap_days(default_days: int, cap_days: int = 400) -> int:
    """Widen a sync's lookback window to cover any gap since the last successful sync, instead
    of a fixed day count that silently drops whatever's older than it.

    Every extraction window in this app (Check-In, New Season, the lightweight sync_kpis) is
    `[today - N days, today]` for a fixed N — correct when syncs happen roughly on schedule, but
    if the athlete goes without syncing for longer than N days, whatever Garmin activities fall
    in the gap between "N days ago" and "the actual last synced date" are never fetched by *any*
    future sync (each one only ever looks back N days from *its own* run date) — confirmed live:
    an 18-day gap (no sync 2026-07-23 to 2026-08-13) left 2026-07-23 through 2026-07-30 with zero
    daily_metrics/completed_activities rows forever, even after the next Check-In ran, because
    that Check-In's fixed 14-day window only reached back to 2026-07-30.

    daily_metrics is used as the "last synced" proxy since every sync path touches it. Capped at
    cap_days (default ~13 months) so a truly stale/abandoned account doesn't trigger a pathological
    full-history pull through the "recent" extraction path — that's cmd_sync_history's job.
    """
    sb = get_supabase()
    user_id = _user_id()
    found = rows(
        sb.table("daily_metrics").select("date")
        .eq("user_id", user_id).order("date", desc=True).limit(1).execute()
    )
    if not found:
        return default_days
    last_date = date.fromisoformat(found[0]["date"])
    gap_days = (date.today() - last_date).days
    return max(default_days, min(gap_days, cap_days))


def _removal_rank(row: dict) -> int | None:
    """Drop order when compressing before a fixed event. Lower goes first; None = never drop.

    Rest days first: if you're shifting because you took an unplanned rest day, you've already
    banked the rest, so repaying it from a scheduled one keeps every training session AND the
    race date. Non-key sessions next. Key sessions are never dropped automatically.
    """
    if row.get("is_rest"):
        return 0
    if not row.get("is_key"):
        return 1
    return None


def plan_shift_layout(
    rows: list[dict],
    race_dates: list[str],
    from_date: str,
    days: int,
) -> tuple[list[dict], list[dict], list[str]]:
    """Pure date arithmetic behind shift_plan — no I/O, so it can be tested directly.

    ``rows`` is the ordered list of scheduled_days on/after ``from_date`` (one row per calendar
    day, rest days included). Returns (kept, dropped, warnings); each kept row carries a
    ``_new_date``.

    Because rows are one-per-day and contiguous, re-laying the kept rows consecutively from
    ``from_date + days`` is all that's needed: freeing ``pending`` rows from the segment before
    an event makes that event land back on its real date automatically.

    ``pending`` is how many days the plan is still running late, NOT ``days``. It starts at
    ``days`` and falls to zero as rows are dropped. Compressing by ``days`` before *every*
    event over-corrects: once the first event has been pulled back onto its real date the plan
    is already in sync, so squeezing the next segment as well would delete a rest day for
    nothing and land the second event a day EARLIER than it actually is. Conversely, if an
    event could only be partly protected, the leftover debt carries forward and the next
    segment gets a chance to pay it off.
    """
    start = date.fromisoformat(from_date)
    kept: list[dict] = []
    dropped: list[dict] = []
    warnings: list[str] = []
    pending = days

    # Walk the plan in event-delimited segments, so an event only forces compression of the
    # work that actually precedes it — sessions after it are untouched.
    idx = 0
    for boundary in [*race_dates, None]:
        if boundary is None:
            segment, boundary_rows = rows[idx:], []
        else:
            segment = [r for r in rows[idx:] if r["date"] < boundary]
            idx += len(segment)
            boundary_rows = [r for r in rows[idx:] if r["date"] == boundary]
            idx += len(boundary_rows)

        if boundary is not None and pending > 0:
            candidates = sorted(
                (r for r in segment if _removal_rank(r) is not None),
                key=lambda r: (_removal_rank(r), r["date"]),
            )
            to_drop = candidates[:pending]
            if len(to_drop) < pending:
                warnings.append(
                    f"Could not fully protect the event on {boundary} — only {len(to_drop)} of "
                    f"{pending} day(s) could be freed before it without dropping a key session, "
                    "so it moves later by the remainder."
                )
            pending -= len(to_drop)
            drop_ids = {id(r) for r in to_drop}
            dropped.extend(to_drop)
            segment = [r for r in segment if id(r) not in drop_ids]

        kept.extend(segment)
        kept.extend(boundary_rows)

    cursor = start + timedelta(days=days)
    for row in kept:
        row["_new_date"] = cursor.isoformat()
        cursor += timedelta(days=1)
    return kept, dropped, warnings


def shift_plan(
    from_date: str,
    days: int = 1,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Slide every scheduled day on/after ``from_date`` forward by ``days``, preserving order.

    This is the 'sequence anchoring' operation: what matters physiologically is the *relative
    spacing* of sessions, not which weekday they land on, so a uniform shift keeps the plan
    intact — the legs/tempo gap, the strength rotation, and (now that the bench wave counts
    sessions rather than calendar weeks) the periodisation all come along unchanged.

    Races are the one thing that genuinely cannot move. Where a shift would push sessions past
    a fixed event, the segment before that event is *compressed* instead: exactly ``days`` rows
    are removed from it so the event still lands on its real date. Removal order is rest days
    first, then non-key sessions; key sessions are never dropped (the shift is refused for that
    segment and reported instead). Dropping a planned rest day is the intended common case —
    if you're shifting because you took an unplanned rest day, you've already banked the rest,
    so repaying it from a scheduled one preserves every training session and the race date.

    Scheduled days are one row per calendar day (rest days included), so the kept rows are
    simply re-laid consecutively from ``from_date + days``.

    Database-only: re-pushing the moved workouts to Garmin is the caller's job (the CLI does it
    via _sync_strength_sessions/_sync_running_sessions, which already delete-and-replace).
    Returns a summary of what moved, what was dropped, and anything it refused to do.
    """
    sb = get_supabase()
    uid = user_id or _user_id()
    start = date.fromisoformat(from_date)

    plan = rows(
        sb.table("plans").select("id").eq("user_id", uid)
        .order("created_at", desc=True).limit(1).execute()
    )
    if not plan:
        return {"shifted": 0, "dropped": [], "warnings": ["No active plan to shift."]}
    plan_id = plan[0]["id"]

    scheduled_rows = rows(
        sb.table("scheduled_days").select("*")
        .eq("user_id", uid).eq("plan_id", plan_id)
        .gte("date", from_date).order("date").execute()
    )
    if not scheduled_rows:
        return {"shifted": 0, "dropped": [], "warnings": ["No scheduled days on or after that date."]}

    profile = row(
        sb.table("athlete_profile").select("events")
        .eq("user_id", uid).maybe_single().execute()
    ) or {}
    # Only events that fall inside the range being shifted can collide with it.
    last_date = date.fromisoformat(scheduled_rows[-1]["date"])
    race_dates = sorted({
        ev["date"] for ev in (profile.get("events") or [])
        if ev.get("date") and start < date.fromisoformat(ev["date"]) <= last_date + timedelta(days=days)
    })

    kept, dropped, warnings = plan_shift_layout(scheduled_rows, race_dates, from_date, days)
    updates = [(r["id"], r["_new_date"]) for r in kept if r["_new_date"] != r["date"]]

    for d in dropped:
        sb.table("strength_sessions").delete().eq("user_id", uid).eq("date", d["date"]).execute()
        sb.table("scheduled_days").delete().eq("id", d["id"]).execute()

    # Move latest-first so an in-flight update never collides with a date still occupied by a
    # row that hasn't moved yet (scheduled_days/strength_sessions are keyed per user+date).
    for row_id, new_date in sorted(updates, key=lambda u: u[1], reverse=True):
        old_date = next(r["date"] for r in kept if r["id"] == row_id)
        sb.table("scheduled_days").update({"date": new_date}).eq("id", row_id).execute()
        sb.table("strength_sessions").update({"date": new_date}) \
            .eq("user_id", uid).eq("date", old_date).execute()

    logger.info(
        "📆 Shifted plan +%dd from %s — %d day(s) moved, %d dropped",
        days, from_date, len(updates), len(dropped),
    )
    return {
        "shifted": len(updates),
        "dropped": [{"date": r["date"], "focus": r.get("focus"), "is_rest": r.get("is_rest")} for r in dropped],
        "warnings": warnings,
    }


# A logged "strength" activity shorter than this is treated as a mis-log or an abandoned
# session rather than a real bench session — confirmed against real data, where 8-minute
# strength_training entries sit alongside genuine 45-80 minute ones. Entries with no recorded
# duration are counted (don't discard data we can't judge).
_MIN_REAL_STRENGTH_SESSION_SECS = 900


def count_completed_bench_sessions(
    wave_start: str | None,
    before_date: str | None = None,
    user_id: str | None = None,
) -> int:
    """How many bench sessions the athlete has actually completed since the wave started.

    Every strength template slot includes a barbell bench press (the "bench every session"
    split — see the project_bench_and_strength_structure_redesign memory), so a completed
    strength session *is* a completed bench session; counting distinct strength dates is exact
    here, not an approximation. Pass ``before_date`` to exclude sessions on/after the first
    date being re-expanded, so a session can't be counted as both completed and upcoming.

    Returns 0 when no wave start is set, which makes the wave begin at the first scheduled
    session — matching the previous date-based fallback.
    """
    if not wave_start:
        return 0
    sb = get_supabase()
    uid = user_id or _user_id()
    query = (
        sb.table("completed_activities").select("date, duration_secs")
        .eq("user_id", uid).eq("activity_type", "strength_training")
        .gte("date", wave_start)
    )
    if before_date:
        query = query.lt("date", before_date)
    activity_rows = rows(query.execute())
    return len({
        r["date"] for r in activity_rows
        if r.get("duration_secs") is None
        or r["duration_secs"] >= _MIN_REAL_STRENGTH_SESSION_SECS
    })


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

    templates = rows(
        sb.table("strength_session_templates").select("*")
        .eq("user_id", user_id).order("slot").order("display_order").execute()
    )
    by_slot: dict[str, list[dict[str, Any]]] = {}
    for t in templates:
        by_slot.setdefault(t["slot"], []).append(t)

    profile = row(
        sb.table("athlete_profile").select("bench_wave_start_date, recurring_session_requests")
        .eq("user_id", user_id).maybe_single().execute()
    ) or {}
    wave_start_str = profile.get("bench_wave_start_date")

    # Block length follows the athlete's own strength cadence, so the wave means "4 weeks of
    # training" for a 2x/week lifter and a 5x/week one alike. Prefer the athlete's stated
    # recurring pattern; fall back to what the plan itself schedules per week.
    strength_requests = [
        r for r in (profile.get("recurring_session_requests") or [])
        if r.get("session_type") == "strength"
    ]
    if strength_requests:
        strength_per_week = len(strength_requests)
    elif corrected_slots:
        span_days = max(
            1,
            (date.fromisoformat(max(corrected_slots)) - date.fromisoformat(min(corrected_slots))).days + 1,
        )
        strength_per_week = max(1, round(len(corrected_slots) / (span_days / 7)))
    else:
        strength_per_week = None

    # Bench wave position = how many bench sessions actually precede this one, not how many
    # calendar weeks have elapsed (see bench_wave.compute_bench_prescription). Past sessions
    # are counted from real completed work; future ones are projected by their position in the
    # upcoming sequence, so the wave stays correct when the plan is shifted.
    first_scheduled = next(iter(corrected_slots), None)
    completed_before = count_completed_bench_sessions(
        wave_start_str, before_date=first_scheduled, user_id=user_id
    )

    sessions: list[dict[str, Any]] = []
    for offset, (session_date_str, slot) in enumerate(corrected_slots.items()):
        rows_for_slot = by_slot.get(slot)
        if not rows_for_slot:
            logger.warning("No strength_session_templates rows for slot %r on %s — skipping", slot, session_date_str)
            continue
        date.fromisoformat(session_date_str)

        exercises = []
        for t in rows_for_slot:
            if t["is_dynamic_bench"]:
                prescription = compute_bench_prescription(completed_before + offset, strength_per_week)
                sets, reps_min, reps_max, rir = (
                    prescription["sets"], prescription["reps_min"], prescription["reps_max"], prescription["rir"],
                )
            else:
                sets, reps_min, reps_max, rir = t["sets"], t["reps_min"], t["reps_max"], t["rir"]
            exercises.append({
                "garmin_category": t["garmin_category"],
                "garmin_exercise_key": t["garmin_exercise_key"],
                "display_name": t["display_name"],
                "sets": sets,
                "reps_min": reps_min,
                "reps_max": reps_max,
                "rest_seconds": t["rest_seconds"],
                "rir": rir,
            })

        sessions.append({
            "date": session_date_str,
            "name": f"Strength {slot} - {rows_for_slot[0]['slot_name']}",
            "slot": slot,
            "slot_name": rows_for_slot[0]["slot_name"],
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
    running_sessions: list[dict[str, Any]] | None = None,
    running_workout_ids: dict[str, dict[str, Any]] | None = None,
) -> str:
    """Persist a full replan to Supabase. Returns the new plan UUID."""
    sb = get_supabase()
    user_id = _user_id()

    # Infer horizon from scheduled_days
    dates = [d["date"] for d in scheduled_days if d.get("date")]
    start_date = min(dates) if dates else str(date.today())
    end_date = max(dates) if dates else str(date.today() + timedelta(days=27))

    # ── Insert plan ──────────────────────────────────────────────────────────
    plan_row = rows(sb.table("plans").insert({
        "user_id": user_id,
        "start_date": start_date,
        "end_date": end_date,
        "markdown": markdown,
    }).execute())
    plan_id = plan_row[0]["id"]
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
    segments_by_date = {
        s["date"]: s["segments"] for s in (running_sessions or []) if s.get("segments")
    }
    running_workout_ids = running_workout_ids or {}
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
                "running_segments": segments_by_date.get(d["date"]),
                "garmin_workout_id": running_workout_ids.get(d["date"], {}).get("workout_id"),
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

        session_row = rows(sb.table("strength_sessions").insert({
            "plan_id": plan_id,
            "user_id": user_id,
            "date": session_date,
            "name": s["name"],
            "slot": s.get("slot"),
            "garmin_workout_id": garmin_id,
            "estimated_duration_secs": s.get("estimated_duration_secs", 3600),
        }).execute())
        session_id = session_row[0]["id"]
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
