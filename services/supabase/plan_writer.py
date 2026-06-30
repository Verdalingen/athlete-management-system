"""Write a completed replan to Supabase."""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Any

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
    return total


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
    sb.table("plans").delete().neq("id", plan_id).eq("user_id", user_id).gte(
        "start_date", start_date
    ).lte("end_date", end_date).execute()

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
                    "reps": ex["reps"],
                    "rest_seconds": ex.get("rest_seconds", 180),
                    "rir": ex.get("rir"),
                }
                for i, ex in enumerate(exercises)
            ]).execute()
            exercise_count += len(exercises)

    logger.info("Inserted %d sessions, %d exercises", session_count, exercise_count)
    return plan_id
