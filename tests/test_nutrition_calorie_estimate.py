"""Tests for the session-specific active-calorie estimate used by sync_todays_nutrition_target().

The estimate is what turns "deficit/surplus by athlete preference, else Garmin passive burn plus
the estimated burn of whatever session is actually on the plan today" into real numbers: strength
sessions use a MET-based formula scaled by planned duration, running sessions use distance-based
kcal/kg/km (planned directly, or derived from duration + target pace). This exists specifically so
two "hard" days with very different sessions (a heavy squat day vs. a 15km tempo run) don't collapse
into the same historical-bucket-average estimate.
"""
from datetime import date, timedelta
from typing import Any

import pytest

from services.supabase.plan_writer import (
    _estimate_session_calories,
    _get_bmr_estimate,
    _pace_to_mps,
    _running_distance_km,
    finalize_recent_nutrition_targets,
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


class _FakeDailyMetricsQuery:
    """Minimal stand-in for the postgrest fluent query builder.

    Just enough to exercise the `.lt` vs `.lte` boundary. Fixed live incident: today's
    row (971 kcal, still accumulating) outranked yesterday's complete one (2429 kcal)
    under `.lte`, because it sorts later by date.
    """

    ROWS: list[dict[str, Any]] = [
        {"date": "2026-08-29", "bmr_calories": 2429},
        {"date": "2026-08-30", "bmr_calories": 971},  # still-accumulating partial-day reading
    ]

    def __init__(self):
        self._cutoff = None
        self._op = None

    def table(self, name): return self
    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self

    def lt(self, col, value):
        self._cutoff, self._op = value, "lt"
        return self

    def lte(self, col, value):
        self._cutoff, self._op = value, "lte"
        return self

    @property
    def not_(self): return self

    def is_(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self

    def execute(self):
        rows = [r for r in self.ROWS if r["bmr_calories"] is not None]
        rows = [r for r in rows if (r["date"] < self._cutoff if self._op == "lt" else r["date"] <= self._cutoff)]
        rows.sort(key=lambda r: r["date"], reverse=True)
        return type("Result", (), {"data": rows[:1]})()


def test_get_bmr_estimate_ignores_todays_still_accumulating_reading(monkeypatch):
    monkeypatch.setattr("services.supabase.plan_writer.get_supabase", lambda: _FakeDailyMetricsQuery())
    monkeypatch.setattr("services.supabase.plan_writer._user_id", lambda: "u1")
    assert _get_bmr_estimate("2026-08-30") == 2429.0


class _FakeFinalizeTable:
    """Minimal stand-in for the postgrest fluent query builder, routed by table name.

    Supports the two read shapes finalize_recent_nutrition_targets() issues
    (.select().eq("user_id", …).eq("date", …).maybe_single().execute()) plus a no-op
    upsert().execute() that just records what was written, so the test can assert on it.
    """

    def __init__(self, client: "_FakeFinalizeClient", name: str):
        self._client = client
        self._name = name
        self._date: str | None = None

    def select(self, *a, **k): return self
    def maybe_single(self): return self

    def eq(self, col, value):
        if col == "date":
            self._date = value
        return self

    def upsert(self, row_data, on_conflict=None):
        self._client.upserts.append((self._name, row_data))
        return self

    def execute(self):
        source = (
            self._client.daily_targets if self._name == "nutrition_daily_targets"
            else self._client.daily_metrics
        )
        data = source.get(self._date) if self._date is not None else None
        return type("Result", (), {"data": data})()


class _FakeFinalizeClient:
    def __init__(self, daily_targets: dict[str, dict], daily_metrics: dict[str, dict]):
        self.daily_targets = daily_targets
        self.daily_metrics = daily_metrics
        self.upserts: list[tuple[str, dict]] = []

    def table(self, name):
        return _FakeFinalizeTable(self, name)


def _finalize_test_dates() -> tuple[str, str, str]:
    today = date.today()
    return (
        str(today - timedelta(days=1)),
        str(today - timedelta(days=2)),
        str(today - timedelta(days=3)),
    )


def test_finalize_recent_nutrition_targets_uses_actual_burn(monkeypatch):
    d1, d2, d3 = _finalize_test_dates()
    # d1: a "planner"-written row with Garmin's now-final totals available -> gets recomputed.
    # d2: source is "manual" (an athlete override) -> left alone.
    # d3: "planner" row but Garmin hasn't finished attributing that day yet -> left alone.
    client = _FakeFinalizeClient(
        daily_targets={
            d1: {"source": "planner"},
            d2: {"source": "manual"},
            d3: {"source": "planner"},
        },
        daily_metrics={
            d1: {"active_calories": 600, "bmr_calories": 1800},
            d3: {"active_calories": None, "bmr_calories": 1800},
        },
    )
    monkeypatch.setattr("services.supabase.plan_writer.get_supabase", lambda: client)
    monkeypatch.setattr("services.supabase.plan_writer._user_id", lambda: "u1")
    monkeypatch.setattr("services.supabase.plan_writer._get_latest_weight_kg", lambda: 80.0)
    monkeypatch.setattr("services.supabase.plan_writer.get_scheduled_day", lambda date_str: None)
    monkeypatch.setattr("services.supabase.plan_writer.get_weight_goal_direction", lambda uid: "maintain")

    written = finalize_recent_nutrition_targets(days_back=3)

    assert len(written) == 1
    row = written[0]
    assert row["date"] == d1
    assert row["calories"] == 2400  # BMR 1800 + active 600, "maintain" -> no adjustment
    assert "Actual TDEE" in row["notes"]
    assert client.upserts == [("nutrition_daily_targets", row)]


def test_finalize_recent_nutrition_targets_none_without_weight(monkeypatch):
    client = _FakeFinalizeClient(daily_targets={}, daily_metrics={})
    monkeypatch.setattr("services.supabase.plan_writer.get_supabase", lambda: client)
    monkeypatch.setattr("services.supabase.plan_writer._user_id", lambda: "u1")
    monkeypatch.setattr("services.supabase.plan_writer._get_latest_weight_kg", lambda: None)

    assert finalize_recent_nutrition_targets() == []
    assert client.upserts == []
