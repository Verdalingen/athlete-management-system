"""Tests for plan_writer.expand_strength_session_slots' trust_given_slot parameter (Phase 4) —
the split between "recompute the slot letter from rotation" (default, used by the non-check-in
full-redraft path) and "trust the given slot verbatim" (used by the solver-driven check-in path,
which has already decided placement to satisfy a real SpacingConstraint).

No real Supabase — a minimal fake client stands in, following this module's own established
"pure logic, thin I/O" split (expand_strength_session_slots itself is I/O-touching, so this is
the one place a fake client is warranted rather than testing a pure function directly)."""
import pytest

from services.supabase import plan_writer


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def gte(self, *args, **kwargs):
        return self

    def lt(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def maybe_single(self, *args, **kwargs):
        return self

    def execute(self):
        return _FakeResult(self._data)


class _FakeClient:
    def __init__(self, tables: dict):
        self._tables = tables

    def table(self, name):
        return _FakeQuery(self._tables.get(name))


TEMPLATES = [
    {
        "slot": "A", "slot_name": "Bench Variant + Legs", "display_order": 0,
        "garmin_category": "BENCH_PRESS", "garmin_exercise_key": "bench", "display_name": "Bench Press",
        "sets": 5, "reps_min": 5, "reps_max": 5, "rest_seconds": 180, "rir": 2, "is_dynamic_bench": False,
    },
    {
        "slot": "C", "slot_name": "Bench Moderate + Upper", "display_order": 0,
        "garmin_category": "BENCH_PRESS", "garmin_exercise_key": "bench", "display_name": "Bench Press",
        "sets": 5, "reps_min": 8, "reps_max": 8, "rest_seconds": 150, "rir": 2, "is_dynamic_bench": False,
    },
]


@pytest.fixture(autouse=True)
def _fake_supabase(monkeypatch):
    monkeypatch.setenv("SUPABASE_USER_ID", "test-user")
    client = _FakeClient({
        "strength_sessions": [{"slot": "B"}],  # last persisted slot -> next in rotation is "C"
        "strength_session_templates": TEMPLATES,
        "athlete_profile": {"bench_wave_start_date": None, "recurring_session_requests": []},
    })
    monkeypatch.setattr(plan_writer, "get_supabase", lambda: client)
    yield


class TestTrustGivenSlot:
    ASSIGNMENTS = [
        {"date": "2026-09-01", "slot": "A"},  # deliberately "wrong" vs rotation continuation
        {"date": "2026-09-03", "slot": "A"},
    ]

    def test_default_recomputes_from_rotation(self):
        sessions = plan_writer.expand_strength_session_slots(self.ASSIGNMENTS)
        by_date = {s["date"]: s["slot"] for s in sessions}
        # last persisted = B -> continues C, A
        assert by_date == {"2026-09-01": "C", "2026-09-03": "A"}

    def test_trust_given_slot_uses_verbatim(self):
        sessions = plan_writer.expand_strength_session_slots(self.ASSIGNMENTS, trust_given_slot=True)
        by_date = {s["date"]: s["slot"] for s in sessions}
        assert by_date == {"2026-09-01": "A", "2026-09-03": "A"}

    def test_content_filling_identical_either_way(self):
        default_sessions = plan_writer.expand_strength_session_slots(self.ASSIGNMENTS)
        trusted_sessions = plan_writer.expand_strength_session_slots(self.ASSIGNMENTS, trust_given_slot=True)
        # Both requested slot "A" content exists in the template set — the exercise content for
        # whichever slot ends up assigned should be built the same way in both modes.
        default_a = next(s for s in default_sessions if s["slot"] == "A")
        trusted_a = next(s for s in trusted_sessions if s["slot"] == "A")
        assert default_a["exercises"] == trusted_a["exercises"]


class TestMultiSessionSameDate:
    """Migration 044: two strength sessions can land on the same calendar date at different
    time_slot values (allow_multi_session_days=True). corrected_slots is keyed by
    (date, time_slot), not bare date — before this fix the second same-date assignment silently
    overwrote the first in the dict, losing a whole session."""

    ASSIGNMENTS = [
        {"date": "2026-09-01", "slot": "A", "time_slot": "morning"},
        {"date": "2026-09-01", "slot": "C", "time_slot": "evening"},
    ]

    def test_both_same_date_sessions_survive_with_trust_given_slot(self):
        sessions = plan_writer.expand_strength_session_slots(self.ASSIGNMENTS, trust_given_slot=True)
        assert len(sessions) == 2
        by_slot_time_slot = {(s["slot"], s["time_slot"]): s["date"] for s in sessions}
        assert by_slot_time_slot == {("A", "morning"): "2026-09-01", ("C", "evening"): "2026-09-01"}

    def test_both_same_date_sessions_survive_with_rotation(self):
        sessions = plan_writer.expand_strength_session_slots(self.ASSIGNMENTS)
        assert len(sessions) == 2
        # last persisted = B -> continues C, A — morning sorts before evening, so morning gets
        # the first rotation slot and evening the second, each keeping its own time_slot.
        by_time_slot = {s["time_slot"]: s["slot"] for s in sessions}
        assert by_time_slot == {"morning": "C", "evening": "A"}

    def test_time_slot_defaults_to_day_when_absent(self):
        sessions = plan_writer.expand_strength_session_slots(
            [{"date": "2026-09-01", "slot": "A"}], trust_given_slot=True
        )
        assert sessions[0]["time_slot"] == "day"
