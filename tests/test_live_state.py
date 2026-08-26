"""Tests for services/scheduling/live_state.py — pure functions turning live scheduled_days-
shaped rows into solve_schedule() inputs for a check-in. No Supabase; hand-built row fixtures."""
from datetime import date, timedelta

from services.scheduling.live_state import compute_checkin_fixed_days, resolve_today_pin
from services.scheduling.program_spec import ProgramSessionType, ProgramSpec

SPEC = ProgramSpec(
    session_types=[
        ProgramSessionType(key="strength-a", category="leg-strength", label="A", session_kind="strength", is_key=True),
        ProgramSessionType(key="strength-c", category="upper-strength", label="C", session_kind="strength", is_key=True),
        ProgramSessionType(key="tempo-run", category="key-run", label="Tempo", session_kind="run", is_key=True),
        ProgramSessionType(key="easy-run", category="easy-run", label="Easy", session_kind="run", is_key=False),
        ProgramSessionType(key="rest", category="rest", label="Rest", session_kind="rest"),
    ],
)


class TestResolveTodayPin:
    def test_no_scheduled_day_gives_no_pin(self):
        assert resolve_today_pin(date(2026, 8, 25), None, None, SPEC) == {}

    def test_strength_day_resolves_via_slot(self):
        today = date(2026, 8, 25)
        row = {"session_type": "strength", "is_key": True}
        pin = resolve_today_pin(today, row, {"slot": "A"}, SPEC)
        assert pin == {today: "strength-a"}

    def test_strength_day_with_no_slot_row_gives_no_pin(self):
        today = date(2026, 8, 25)
        row = {"session_type": "strength", "is_key": True}
        assert resolve_today_pin(today, row, None, SPEC) == {}

    def test_strength_day_with_unknown_slot_gives_no_pin(self):
        today = date(2026, 8, 25)
        row = {"session_type": "strength", "is_key": True}
        assert resolve_today_pin(today, row, {"slot": "Z"}, SPEC) == {}

    def test_key_run_resolves_unambiguously(self):
        today = date(2026, 8, 25)
        row = {"session_type": "run", "is_key": True}
        assert resolve_today_pin(today, row, None, SPEC) == {today: "tempo-run"}

    def test_easy_run_resolves_unambiguously(self):
        today = date(2026, 8, 25)
        row = {"session_type": "run", "is_key": False}
        assert resolve_today_pin(today, row, None, SPEC) == {today: "easy-run"}

    def test_rest_day_resolves(self):
        today = date(2026, 8, 25)
        row = {"session_type": "rest", "is_key": False}
        assert resolve_today_pin(today, row, None, SPEC) == {today: "rest"}


class TestComputeCheckinFixedDays:
    def _window(self):
        return [date(2026, 8, 24) + timedelta(days=i) for i in range(7)]

    def test_existing_days_carried_forward(self):
        window = self._window()
        existing = {
            window[0]: {"session_type": "strength", "slot": "A"},
            window[1]: {"session_type": "run", "is_key": True},
        }
        fixed = compute_checkin_fixed_days(window, existing, {}, SPEC)
        assert fixed == {window[0]: "strength-a", window[1]: "tempo-run"}

    def test_override_wins_over_existing(self):
        window = self._window()
        existing = {window[0]: {"session_type": "strength", "slot": "A"}}
        overrides = {window[0]: "strength-c"}
        fixed = compute_checkin_fixed_days(window, existing, overrides, SPEC)
        assert fixed == {window[0]: "strength-c"}

    def test_override_outside_window_ignored(self):
        window = self._window()
        outside = date(2027, 1, 1)
        fixed = compute_checkin_fixed_days(window, {}, {outside: "rest"}, SPEC)
        assert fixed == {}

    def test_override_with_unknown_key_ignored(self):
        window = self._window()
        fixed = compute_checkin_fixed_days(window, {}, {window[0]: "not-a-real-key"}, SPEC)
        assert fixed == {}

    def test_new_tail_date_with_no_existing_row_left_undecided(self):
        window = self._window()
        fixed = compute_checkin_fixed_days(window, {}, {}, SPEC)
        assert fixed == {}

    def test_ambiguous_existing_row_left_undecided(self):
        # Two session types share session_kind='run', is_key=False? No — SPEC only has one
        # easy-run type; build a spec with a genuine ambiguity for this test.
        ambiguous_spec = ProgramSpec(
            session_types=[
                ProgramSessionType(key="easy-run-1", category="a", label="A", session_kind="run", is_key=False),
                ProgramSessionType(key="easy-run-2", category="b", label="B", session_kind="run", is_key=False),
            ],
        )
        window = self._window()
        existing = {window[0]: {"session_type": "run", "is_key": False}}
        fixed = compute_checkin_fixed_days(window, existing, {}, ambiguous_spec)
        assert fixed == {}
