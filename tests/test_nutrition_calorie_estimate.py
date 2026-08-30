"""Tests for the session-specific active-calorie estimate used by sync_todays_nutrition_target().

The estimate is what turns "deficit/surplus by athlete preference, else Garmin passive burn plus
the estimated burn of whatever session is actually on the plan today" into real numbers: strength
sessions use a MET-based formula scaled by planned duration, running sessions use distance-based
kcal/kg/km (planned directly, or derived from duration + target pace). This exists specifically so
two "hard" days with very different sessions (a heavy squat day vs. a 15km tempo run) don't collapse
into the same historical-bucket-average estimate.
"""
import pytest

from services.supabase.plan_writer import (
    _estimate_session_calories,
    _pace_to_mps,
    _running_distance_km,
)


def test_pace_to_mps():
    # 5:00/km -> 1000m / 300s
    assert _pace_to_mps("5:00") == pytest.approx(1000 / 300)


def test_running_distance_km_from_explicit_distance():
    segments = [
        {"distance_meters": 1000},
        {"distance_meters": 400, "repeat_count": 4},
    ]
    assert _running_distance_km(segments) == pytest.approx((1000 + 400 * 4) / 1000)


def test_running_distance_km_from_duration_and_pace():
    # 30 min at a 5:00-5:30/km band
    segments = [{"duration_secs": 1800, "pace_low": "5:00", "pace_high": "5:30"}]
    mps = (_pace_to_mps("5:00") + _pace_to_mps("5:30")) / 2
    assert _running_distance_km(segments) == pytest.approx(mps * 1800 / 1000)


def test_running_distance_km_ignores_incomplete_segments():
    # No distance and no full pace band -> contributes nothing, doesn't crash
    segments = [{"duration_secs": 600}]
    assert _running_distance_km(segments) == 0.0


def test_estimate_session_calories_none_for_rest_day():
    today = {"date": "2026-08-30", "session_type": "rest", "is_rest": True}
    assert _estimate_session_calories(today, weight_kg=80) is None


def test_estimate_session_calories_none_when_today_missing():
    assert _estimate_session_calories(None, weight_kg=80) is None


def test_estimate_session_calories_strength(monkeypatch):
    monkeypatch.setattr(
        "services.supabase.plan_writer._get_strength_duration_secs", lambda date_str: 3600
    )
    today = {"date": "2026-08-30", "session_type": "strength", "is_rest": False}
    weight_kg = 80.0
    expected = 6.0 * (3.5 / 200) * weight_kg * 60  # MET * kcal/kg/min * weight * minutes
    assert _estimate_session_calories(today, weight_kg) == pytest.approx(expected)


def test_estimate_session_calories_strength_none_without_duration(monkeypatch):
    monkeypatch.setattr(
        "services.supabase.plan_writer._get_strength_duration_secs", lambda date_str: None
    )
    today = {"date": "2026-08-30", "session_type": "strength", "is_rest": False}
    assert _estimate_session_calories(today, weight_kg=80) is None


def test_estimate_session_calories_running():
    today = {
        "date": "2026-08-30",
        "session_type": "run",
        "is_rest": False,
        "running_segments": [{"distance_meters": 10000}],
    }
    weight_kg = 70.0
    assert _estimate_session_calories(today, weight_kg) == pytest.approx(1.0 * weight_kg * 10.0)


def test_estimate_session_calories_running_none_without_distance():
    today = {
        "date": "2026-08-30",
        "session_type": "run",
        "is_rest": False,
        "running_segments": [],
    }
    assert _estimate_session_calories(today, weight_kg=70) is None


def test_estimate_session_calories_none_for_untracked_session_types():
    # cross/race have no duration or distance field on scheduled_days today, so honestly
    # returning None (fall back to the historical day-type average) beats fabricating a number.
    today = {"date": "2026-08-30", "session_type": "cross", "is_rest": False}
    assert _estimate_session_calories(today, weight_kg=80) is None
