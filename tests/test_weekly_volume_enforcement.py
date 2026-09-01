"""Tests for _fix_weekly_volume — deterministic enforcement of the athlete's weekly session
volume.

Session count per week is mechanically checkable AND mechanically fixable, so it does not
depend on the LLM getting it right: three real check-ins under-scheduled strength (2/week
against a 3/week pattern), each time filling the gap with rest days, and prompt fixes did not
hold. The function converts REST days into the missing session type and never overwrites real
training, so it can only add work the athlete already committed to.

Scheduled days here use the LLM output schema's `is_key_session` spelling (plan_writer
translates it to the DB's `is_key` on write). Weeks run Monday-Sunday; 2026-01-05 is a Monday.
"""
from datetime import date, timedelta

from services.ai.langgraph.nodes.weekly_planner_node import _fix_weekly_volume

MONDAY = "2026-01-05"


def make_day(iso: str, session_type: str = "rest", **kw) -> dict:
    """One scheduled day. Defaults to a rest day, which is what the function fills in."""
    is_rest = session_type == "rest"
    return {
        "date": iso,
        "day_name": date.fromisoformat(iso).strftime("%A"),
        "session_type": session_type,
        "focus": kw.get("focus", "Rest" if is_rest else session_type.title()),
        "description": kw.get("description", ""),
        "is_rest": kw.get("is_rest", is_rest),
        "is_key_session": kw.get("is_key_session", False),
    }


def make_week(types: list[str], start: str = MONDAY, **per_day) -> list[dict]:
    """Seven days from `start`, one session_type each. `per_day` keys like d0/d6 pass extra
    fields through to that day (e.g. d2={"is_key_session": True}).
    """
    days = []
    for i, st in enumerate(types):
        iso = (date.fromisoformat(start) + timedelta(days=i)).isoformat()
        days.append(make_day(iso, st, **per_day.get(f"d{i}", {})))
    return days


def must(session_type: str, day_of_week: str | None = None, **kw) -> dict:
    req = {"importance": "must", "session_type": session_type}
    if day_of_week:
        req["day_of_week"] = day_of_week
    req.update(kw)
    return req


def types_by_weekday(days: list[dict]) -> dict[str, str]:
    return {date.fromisoformat(d["date"]).strftime("%A"): d["session_type"] for d in days}


def count_type(days: list[dict], session_type: str) -> int:
    return sum(
        1 for d in days
        if d["session_type"] == session_type and not d["is_rest"]
    )


class TestNoOpCases:
    def test_no_recurring_requests_changes_nothing(self):
        days = make_week(["rest"] * 7)
        before = [dict(d) for d in days]
        assert _fix_weekly_volume(days, [], [], []) == []
        assert days == before

    def test_only_optional_requests_changes_nothing(self):
        days = make_week(["rest"] * 7)
        before = [dict(d) for d in days]
        requests = [{"importance": "nice_to_have", "session_type": "strength"}]
        assert _fix_weekly_volume(days, [], [], requests) == []
        assert days == before

    def test_a_week_already_meeting_its_volume_is_untouched(self):
        days = make_week(
            ["strength", "run", "strength", "rest", "strength", "run", "rest"]
        )
        before = [dict(d) for d in days]
        requests = [must("strength")] * 3
        assert _fix_weekly_volume(days, [], [], requests) == []
        assert days == before

    def test_extra_sessions_beyond_the_pattern_are_not_removed(self):
        # The floor is a floor, not a target — four strength days stay four.
        days = make_week(
            ["strength", "rest", "strength", "rest", "strength", "rest", "strength"]
        )
        requests = [must("strength")] * 3
        _fix_weekly_volume(days, [], [], requests)
        assert count_type(days, "strength") == 4


class TestTruncatedWeeks:
    def test_a_partial_week_is_not_treated_as_short(self):
        # Only 4 days in the window — a truncated week at the edge of the planning range
        # would otherwise look like it is missing sessions simply because it is cut off.
        days = make_week(["rest"] * 4)
        requests = [must("strength")] * 3
        assert _fix_weekly_volume(days, [], [], requests) == []
        assert count_type(days, "strength") == 0

    def test_a_complete_week_beside_a_partial_one_is_still_enforced(self):
        full = make_week(["rest"] * 7, start=MONDAY)
        tail = make_week(["rest"] * 2, start="2026-01-12")
        days = full + tail
        _fix_weekly_volume(days, [], [], [must("strength")])

        assert count_type(days[:7], "strength") == 1
        assert count_type(days[7:], "strength") == 0


class TestInsertion:
    def test_a_short_week_gets_the_missing_session(self):
        days = make_week(["strength", "rest", "strength", "rest", "rest", "rest", "rest"])
        warnings = _fix_weekly_volume(days, [], [], [must("strength")] * 3)

        assert warnings == []
        assert count_type(days, "strength") == 3

    def test_insertions_only_consume_rest_days(self):
        days = make_week(["run", "rest", "run", "rest", "run", "rest", "run"])
        _fix_weekly_volume(days, [], [], [must("strength")] * 2)

        # The four run days survive; strength went into former rest days.
        assert count_type(days, "run") == 4
        assert count_type(days, "strength") == 2

    def test_an_inserted_session_is_not_marked_key_or_rest(self):
        days = make_week(["rest"] * 7)
        _fix_weekly_volume(days, [], [], [must("strength")])
        inserted = next(d for d in days if d["session_type"] == "strength")

        assert inserted["is_rest"] is False
        assert inserted["is_key_session"] is False

    def test_inserted_strength_gets_a_session_entry(self):
        days = make_week(["rest"] * 7)
        strength: list[dict] = []
        _fix_weekly_volume(days, strength, [], [must("strength")])

        assert len(strength) == 1
        inserted = next(d for d in days if d["session_type"] == "strength")
        assert strength[0]["date"] == inserted["date"]

    def test_inserted_run_gets_easy_aerobic_segments(self):
        days = make_week(["rest"] * 7)
        running: list[dict] = []
        _fix_weekly_volume(days, [], running, [must("run")])

        assert len(running) == 1
        segments = running[0]["segments"]
        assert len(segments) == 1
        assert segments[0]["segment_type"] == "steady"
        assert segments[0]["zone"] == "Z2"
        assert segments[0]["duration_secs"] == 2700

    def test_multiple_missing_sessions_are_all_inserted(self):
        days = make_week(["rest"] * 7)
        _fix_weekly_volume(days, [], [], [must("run")] * 3)
        assert count_type(days, "run") == 3

    def test_two_session_types_are_enforced_independently(self):
        days = make_week(["rest"] * 7)
        requests = [must("strength")] * 2 + [must("run")] * 2
        _fix_weekly_volume(days, [], [], requests)

        assert count_type(days, "strength") == 2
        assert count_type(days, "run") == 2


class TestPreferredDays:
    def test_a_free_preferred_day_is_used_first(self):
        days = make_week(["rest"] * 7)
        _fix_weekly_volume(days, [], [], [must("strength", "friday")])

        assert types_by_weekday(days)["Friday"] == "strength"

    def test_falls_back_to_any_free_day_when_the_preferred_one_is_taken(self):
        days = make_week(["rest", "rest", "rest", "rest", "run", "rest", "rest"])
        _fix_weekly_volume(days, [], [], [must("strength", "friday")])

        # Friday holds a real run, so it is not overwritten.
        assert types_by_weekday(days)["Friday"] == "run"
        assert count_type(days, "strength") == 1


class TestStrengthSpacing:
    def test_strength_is_not_inserted_adjacent_to_existing_strength(self):
        # Strength on Monday and Sunday; the only rest days adjacent to them are Tue and Sat.
        days = make_week(
            ["strength", "rest", "rest", "rest", "rest", "rest", "strength"]
        )
        _fix_weekly_volume(days, [], [], [must("strength")] * 3)

        by_day = types_by_weekday(days)
        assert by_day["Tuesday"] != "strength"
        assert by_day["Saturday"] != "strength"
        assert count_type(days, "strength") == 3

    def test_runs_are_not_subject_to_strength_spacing(self):
        days = make_week(["run", "rest", "rest", "rest", "rest", "rest", "run"])
        _fix_weekly_volume(days, [], [], [must("run")] * 4)

        assert count_type(days, "run") == 4


class TestRelocation:
    def test_sessions_snap_back_onto_the_preferred_grid_to_free_a_legal_slot(self):
        # Strength on Tue+Thu against a Mon/Wed/Fri pattern. Every remaining rest day is
        # adjacent to one of them, so no slot-hunting can fix it — the fix is to relocate
        # Tue->Mon and Thu->Wed, which frees Friday legally.
        days = make_week(
            ["rest", "strength", "rest", "strength", "rest", "rest", "rest"]
        )
        requests = [
            must("strength", "monday"),
            must("strength", "wednesday"),
            must("strength", "friday"),
        ]
        warnings = _fix_weekly_volume(days, [], [], requests)

        by_day = types_by_weekday(days)
        assert warnings == []
        assert count_type(days, "strength") == 3
        assert by_day["Monday"] == "strength"
        assert by_day["Wednesday"] == "strength"
        assert by_day["Friday"] == "strength"

    def test_relocation_moves_the_linked_session_entry_too(self):
        days = make_week(
            ["rest", "strength", "rest", "strength", "rest", "rest", "rest"]
        )
        strength = [{"date": "2026-01-06", "slot": "A"}, {"date": "2026-01-08", "slot": "B"}]
        requests = [
            must("strength", "monday"),
            must("strength", "wednesday"),
            must("strength", "friday"),
        ]
        _fix_weekly_volume(days, strength, [], requests)

        strength_dates = {s["date"] for s in strength}
        scheduled = {d["date"] for d in days if d["session_type"] == "strength"}
        assert strength_dates <= scheduled

    def test_a_key_session_is_never_displaced(self):
        # Wednesday holds a key run; the pattern wants strength there.
        days = make_week(
            ["rest", "strength", "run", "strength", "rest", "rest", "rest"],
            d2={"is_key_session": True},
        )
        requests = [
            must("strength", "monday"),
            must("strength", "wednesday"),
            must("strength", "friday"),
        ]
        _fix_weekly_volume(days, [], [], requests)

        by_day = types_by_weekday(days)
        assert by_day["Wednesday"] == "run"


class TestUnplaceable:
    def test_a_fully_booked_week_warns_instead_of_overwriting(self):
        days = make_week(["run"] * 7)
        warnings = _fix_weekly_volume(days, [], [], [must("strength")])

        assert len(warnings) == 1
        assert "strength" in warnings[0]
        assert MONDAY in warnings[0]
        assert count_type(days, "run") == 7
        assert count_type(days, "strength") == 0

    def test_the_warning_names_how_many_sessions_are_missing(self):
        days = make_week(["run"] * 7)
        warnings = _fix_weekly_volume(days, [], [], [must("strength")] * 2)

        assert len(warnings) == 1
        assert "2 strength" in warnings[0]

    def test_partial_placement_still_reports_the_remainder(self):
        # One rest day available against two missing strength sessions.
        days = make_week(["run", "run", "run", "rest", "run", "run", "run"])
        warnings = _fix_weekly_volume(days, [], [], [must("strength")] * 2)

        assert count_type(days, "strength") == 1
        assert len(warnings) == 1
        assert "1 strength" in warnings[0]


class TestMultipleWeeks:
    def test_each_complete_week_is_enforced_separately(self):
        week1 = make_week(["strength", "rest", "rest", "rest", "rest", "rest", "rest"], MONDAY)
        week2 = make_week(["rest"] * 7, "2026-01-12")
        days = week1 + week2
        _fix_weekly_volume(days, [], [], [must("strength")] * 2)

        assert count_type(days[:7], "strength") == 2
        assert count_type(days[7:], "strength") == 2

    def test_day_order_is_preserved(self):
        days = make_week(["rest"] * 7) + make_week(["rest"] * 7, "2026-01-12")
        _fix_weekly_volume(days, [], [], [must("strength")] * 2)

        assert [d["date"] for d in days] == sorted(d["date"] for d in days)
        assert len(days) == 14

    def test_strength_spacing_holds_across_the_week_boundary(self):
        # Strength on the Sunday of week 1 must stop week 2 from opening with one on Monday.
        week1 = make_week(["rest", "rest", "rest", "rest", "rest", "rest", "strength"], MONDAY)
        week2 = make_week(["rest"] * 7, "2026-01-12")
        days = week1 + week2
        _fix_weekly_volume(days, [], [], [must("strength")])

        assert types_by_weekday(days[7:])["Monday"] != "strength"
        assert count_type(days[7:], "strength") == 1


class TestIdempotence:
    def test_running_twice_changes_nothing_the_second_time(self):
        # The planner runs this after every generation; a second pass over an
        # already-corrected week must not keep piling on sessions.
        days = make_week(["rest", "strength", "rest", "strength", "rest", "rest", "rest"])
        strength: list[dict] = []
        requests = [
            must("strength", "monday"),
            must("strength", "wednesday"),
            must("strength", "friday"),
        ]
        _fix_weekly_volume(days, strength, [], requests)

        after_first = [dict(d) for d in days]
        strength_after_first = [dict(s) for s in strength]
        warnings = _fix_weekly_volume(days, strength, [], requests)

        assert warnings == []
        assert days == after_first
        assert strength == strength_after_first
