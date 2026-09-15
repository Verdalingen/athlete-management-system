"""Tests for the HR-zone wiring into upsert_completed_activities (point:
cardio-session-hr-zones): every imported session with avg_heart_rate gets its zone computed from
the athlete's current user_settings.max_heart_rate_bpm and persisted alongside it, regardless of
activity_type — and left unset (not guessed) when max_heart_rate_bpm isn't configured.

Fake Supabase client, same style as test_plan_writer_strength_slots.py: minimal, in-memory,
ignores query filters (this codebase's established "pure logic, thin I/O" fake-client pattern for
these tests) but captures .upsert() payloads so they can be asserted on directly.
"""
import pytest

from services.supabase import athlete_profile, plan_writer


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, table_name, store):
        self._table_name = table_name
        self._store = store

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def maybe_single(self, *args, **kwargs):
        return self

    def upsert(self, rows, **kwargs):
        self._store["upserted"].setdefault(self._table_name, []).extend(rows)
        return self

    def execute(self):
        if self._table_name == "user_settings":
            return _FakeResult(self._store.get("user_settings"))
        return _FakeResult(None)


class _FakeClient:
    def __init__(self, user_settings):
        self._store = {"user_settings": user_settings, "upserted": {}}

    def table(self, name):
        return _FakeQuery(name, self._store)

    def last_upserted(self, table_name):
        return self._store["upserted"].get(table_name, [])


def _install_fake(monkeypatch, user_settings):
    monkeypatch.setenv("SUPABASE_USER_ID", "test-user")
    client = _FakeClient(user_settings)
    monkeypatch.setattr(plan_writer, "get_supabase", lambda: client)
    monkeypatch.setattr(athlete_profile, "get_supabase", lambda: client)
    return client


RUNNING_RECORD = {
    "activity_id": 1,
    "date": "2026-09-15",
    "activity_type": "running",
    "avg_heart_rate": 150,
    "max_heart_rate": 170,
}


class TestHrZonePersistedOnUpsert:
    def test_running_session_gets_zone_from_profile_max_hr(self, monkeypatch):
        client = _install_fake(monkeypatch, {"max_heart_rate_bpm": 200})

        plan_writer.upsert_completed_activities([RUNNING_RECORD])

        [row] = client.last_upserted("completed_activities")
        assert row["hr_zone"] == "Z3"
        assert row["hr_zone_low_bpm"] == 140
        assert row["hr_zone_high_bpm"] == 160

    def test_non_running_cardio_also_gets_a_zone(self, monkeypatch):
        # explicitly not restricted to activity_type == "running"
        client = _install_fake(monkeypatch, {"max_heart_rate_bpm": 200})
        record = {**RUNNING_RECORD, "activity_type": "cycling"}

        plan_writer.upsert_completed_activities([record])

        [row] = client.last_upserted("completed_activities")
        assert row["hr_zone"] == "Z3"

    def test_no_zone_fields_when_max_heart_rate_bpm_unset(self, monkeypatch):
        client = _install_fake(monkeypatch, user_settings=None)

        plan_writer.upsert_completed_activities([RUNNING_RECORD])

        [row] = client.last_upserted("completed_activities")
        assert "hr_zone" not in row
        assert "hr_zone_low_bpm" not in row
        assert "hr_zone_high_bpm" not in row

    def test_no_zone_fields_when_avg_heart_rate_missing(self, monkeypatch):
        client = _install_fake(monkeypatch, {"max_heart_rate_bpm": 200})
        record = {k: v for k, v in RUNNING_RECORD.items() if k != "avg_heart_rate"}

        plan_writer.upsert_completed_activities([record])

        [row] = client.last_upserted("completed_activities")
        assert "hr_zone" not in row


class TestGetMaxHeartRateBpm:
    def test_returns_configured_value(self, monkeypatch):
        _install_fake(monkeypatch, {"max_heart_rate_bpm": 187})
        assert athlete_profile.get_max_heart_rate_bpm("test-user") == 187

    def test_returns_none_when_unset(self, monkeypatch):
        _install_fake(monkeypatch, user_settings=None)
        assert athlete_profile.get_max_heart_rate_bpm("test-user") is None
