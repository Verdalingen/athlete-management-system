"""Convert a GarminData dict into flat per-day records for the daily_metrics table.

Usage (called after any extraction):

    from services.garmin.history_sync import build_daily_metrics_records
    records = build_daily_metrics_records(asdict(garmin_data))
    upsert_daily_metrics_batch(records)
"""
from __future__ import annotations

from typing import Any


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

    # ── Body battery (end-of-day level, typically last 56 days) ───────────────
    for entry in garmin_data.get("body_battery") or []:
        d = entry.get("date")
        if d:
            row(d)["body_battery"] = entry.get("end_of_day")

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
        r["hrv_overnight"] = sleep.get("avg_overnight_hrv")
        r["rhr"]           = sleep.get("resting_heart_rate")
        r["stress_avg"]    = stress.get("avg_level")

    # ── Body weight (from body composition API) ────────────────────────────────
    body_metrics = garmin_data.get("body_metrics") or {}
    weight_blob  = body_metrics.get("weight") or {}
    for entry in weight_blob.get("data") or []:
        d = entry.get("date")
        if d:
            row(d)["weight_kg"] = entry.get("weight")

    return list(by_date.values())
