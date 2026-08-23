"""Convert a GarminData dict into flat per-day records for the daily_metrics table.

Usage (called after any extraction):

    from services.garmin.history_sync import build_daily_metrics_records
    records = build_daily_metrics_records(asdict(garmin_data))
    upsert_daily_metrics_batch(records)
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def build_daily_metrics_records(garmin_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Merge all time-series fields from a GarminData dict into per-day records.

    Returns a list of dicts, one per date, ready to upsert to ``daily_metrics``.
    Fields are ``None`` when the source didn't have data for that date.
    """
    by_date: dict[str, dict[str, Any]] = {}

    def row(d: str) -> dict[str, Any]:
        if d not in by_date:
            by_date[d] = {"date": d}
        return by_date[d]

    # ── Training load history (360-day dense EWMA series from activity loads) ──
    for entry in garmin_data.get("training_load_history") or []:
        d = entry.get("date")
        if not d:
            continue
        r = row(d)
        # The calculator emits both aliased names; take whichever is present
        r["ctl"]      = entry.get("chronic_28d_avg") or entry.get("chronic_load")
        r["atl"]      = entry.get("acute_7d_sum")    or entry.get("acute_load")
        r["tsb"]      = entry.get("tsb")
        r["acwr"]     = entry.get("acwr_uncoupled")  or entry.get("acwr_7d28d_uncoupled")
        r["ramp_7d"]  = entry.get("ramp_7d")
        r["monotony"] = entry.get("monotony_7d")
        r["strain"]   = entry.get("strain_7d")

    # ── VO2max history (sparse – only days Garmin emits a new estimate) ────────
    vo2_hist = garmin_data.get("vo2_max_history") or {}
    for entry in vo2_hist.get("running") or []:
        d = entry.get("date")
        if d:
            row(d)["vo2max_running"] = entry.get("value")
    for entry in vo2_hist.get("cycling") or []:
        d = entry.get("date")
        if d:
            row(d)["vo2max_cycling"] = entry.get("value")

    # Also check long-term trend (sampled every N days; fills gaps in short window)
    lt_vo2 = garmin_data.get("long_term_vo2_max_trend") or {}
    for entry in lt_vo2.get("running") or []:
        d = entry.get("date")
        if d and "vo2max_running" not in by_date.get(d, {}):
            row(d)["vo2max_running"] = entry.get("value")
    for entry in lt_vo2.get("cycling") or []:
        d = entry.get("date")
        if d and "vo2max_cycling" not in by_date.get(d, {}):
            row(d)["vo2max_cycling"] = entry.get("value")

    # ── Body battery (end-of-day level + overnight recharge, typically last 56 days) ──
    for entry in garmin_data.get("body_battery") or []:
        d = entry.get("date")
        if d:
            r = row(d)
            r["body_battery"] = entry.get("end_of_day")
            r["body_battery_overnight_gain"] = entry.get("overnight_gain")

    # ── Recovery indicators: sleep, HRV, RHR, stress (typically last 56 days) ─
    for ri in garmin_data.get("recovery_indicators") or []:
        d = ri.get("date")
        if not d:
            continue
        r = row(d)
        sleep  = ri.get("sleep") or {}
        dur    = sleep.get("duration") or {}
        qual   = sleep.get("quality") or {}
        stress = ri.get("stress") or {}
        r["sleep_hours"]   = dur.get("total")
        r["sleep_score"]   = qual.get("overall_score")
        r["sleep_deep_h"]  = dur.get("deep")
        r["sleep_rem_h"]   = dur.get("rem")
        r["hrv_overnight"]   = sleep.get("avg_overnight_hrv")
        r["rhr"]             = sleep.get("resting_heart_rate")
        r["stress_avg"]      = stress.get("avg_level")
        r["sleep_stress_avg"] = sleep.get("stress_avg")

    # ── Body weight (from body composition API) ────────────────────────────────
    body_metrics = garmin_data.get("body_metrics") or {}
    weight_blob  = body_metrics.get("weight") or {}
    for entry in weight_blob.get("data") or []:
        d = entry.get("date")
        if d:
            row(d)["weight_kg"] = entry.get("weight")

    # ── Daily caloric expenditure + respiration (Garmin get_stats, per-day list) ──
    for entry in garmin_data.get("daily_stats") or []:
        d = entry.get("date")
        if d:
            r = row(d)
            r["total_calories"] = entry.get("total_calories")
            r["active_calories"] = entry.get("active_calories")
            r["bmr_calories"] = entry.get("bmr_calories")
            r["respiration_avg"] = entry.get("respiration_average")

    # ── Race predictions: dense daily history (up to 366 days in one call — Garmin
    # recomputes every day, unlike VO2max/training-load which only get sampled) ──
    for entry in garmin_data.get("race_prediction_history") or []:
        d = entry.get("date")
        if d:
            r = row(d)
            r["predicted_5k_secs"] = entry.get("predicted_5k_secs")
            r["predicted_10k_secs"] = entry.get("predicted_10k_secs")
            r["predicted_half_marathon_secs"] = entry.get("predicted_half_marathon_secs")
            r["predicted_marathon_secs"] = entry.get("predicted_marathon_secs")

    # Today-only value from the regular (short-range) extraction — keeps this current
    # on every lightweight sync without needing the full historical range call again.
    today_preds = garmin_data.get("race_predictions") or {}
    today_date = today_preds.get("calendarDate")
    if today_date:
        r = row(today_date)
        r["predicted_5k_secs"] = today_preds.get("time5K")
        r["predicted_10k_secs"] = today_preds.get("time10K")
        r["predicted_half_marathon_secs"] = today_preds.get("timeHalfMarathon")
        r["predicted_marathon_secs"] = today_preds.get("timeMarathon")

    return list(by_date.values())


def build_completed_activity_records(garmin_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert a GarminData dict's recent_activities into flat rows for completed_activities.

    One row per activity (not per day — multiple activities can share a date).
    """
    records: list[dict[str, Any]] = []
    for a in garmin_data.get("recent_activities") or []:
        activity_id = a.get("activity_id")
        start_time = a.get("start_time")
        if not activity_id or not start_time:
            continue
        summary = a.get("summary") or {}
        records.append({
            "activity_id": activity_id,
            # Handles both "YYYY-MM-DD HH:MM:SS" and ISO "T"-separated start_time forms.
            "date": start_time[:10],
            "activity_type": a.get("activity_type"),
            "activity_name": a.get("activity_name"),
            "duration_secs": summary.get("duration"),
            "distance_meters": summary.get("distance"),
            "avg_heart_rate": summary.get("average_hr"),
            "max_heart_rate": summary.get("max_hr"),
            "calories": summary.get("calories"),
            "activity_training_load": summary.get("activity_training_load"),
        })
    return records


def build_completed_exercise_set_records(
    garmin_data: dict[str, Any],
    planned_sessions_by_date: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Match completed Garmin exercise sets back to the specific planned exercise that produced
    them, for autoregulated weight progression (each bench variant — paused, close-grip,
    touch-and-go — tracks its own performance history instead of sharing one 1RM-derived number).

    Matching is positional, not by Garmin's wktStepIndex field — that field's exact indexing
    semantics (global across the workout vs. local to a repeat group) are undocumented and haven't
    been verified against a real completed session. Instead: for each date with both a completed
    activity carrying exercise_sets and a planned strength session, walk the planned exercises in
    display_order and consume that many ACTIVE completed sets per exercise, sequentially. This
    assumes the athlete performs the pushed workout's exercises in the planned order without
    skipping — true if following the watch-guided workout as intended, but will misattribute sets
    if exercises are done out of order or with extra/fewer sets than planned.
    garmin_category is checked as a sanity guard: if any set in a positional block doesn't match
    the expected category, that whole block is skipped (logged) rather than written, since a
    mismatch means the positional assumption broke down for this session.

    planned_sessions_by_date: {date: [exercise dicts sorted by display_order, each with 'id',
    'garmin_category', 'display_name', 'sets', 'reps_min', 'reps_max']} — the currently-planned
    exercises for each date, as stored in Supabase.
    """
    records: list[dict[str, Any]] = []
    for act in garmin_data.get("recent_activities") or []:
        exercise_sets = act.get("exercise_sets")
        start_time = act.get("start_time")
        if not exercise_sets or not start_time:
            continue
        act_date = start_time[:10]
        planned = planned_sessions_by_date.get(act_date)
        if not planned:
            continue

        active_sets = [s for s in exercise_sets if s.get("set_type") == "ACTIVE"]
        cursor = 0
        for ex in planned:
            n = ex.get("sets") or 0
            block = active_sets[cursor:cursor + n]
            cursor += n
            if not block:
                continue
            expected_cat = ex.get("garmin_category")
            if expected_cat and any(
                (s.get("exercise_category") or "").upper() != expected_cat.upper() for s in block
            ):
                logger.warning(
                    "Skipping completed-set match for %s on %s — category mismatch "
                    "(expected %s); positional matching assumption likely broke down this session",
                    ex.get("display_name"), act_date, expected_cat,
                )
                continue
            for i, s in enumerate(block):
                if s.get("reps") is None or s.get("weight_kg") is None:
                    continue
                records.append({
                    "date": act_date,
                    "exercise_id": ex.get("id"),
                    "display_name": ex.get("display_name"),
                    "garmin_category": expected_cat,
                    "set_index": i,
                    "reps": s["reps"],
                    "weight_kg": s["weight_kg"],
                    "prescribed_reps_min": ex.get("reps_min"),
                    "prescribed_reps_max": ex.get("reps_max"),
                })
    return records
