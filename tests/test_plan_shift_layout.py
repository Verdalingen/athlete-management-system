"""Tests for plan_shift_layout — the pure date arithmetic behind shift_plan().

Sequence anchoring: what matters physiologically is the relative spacing of sessions, not
which weekday they land on, so a shift slides everything forward while preserving order.
Races are the one thing that cannot move, so where a shift would push sessions past a fixed
event, the segment before it is compressed instead — rest days first, then non-key sessions,
never key sessions.

Rows here mirror the scheduled_days shape: one row per calendar day (rest days included),
contiguous, ordered, using the DB's `is_key` spelling rather than the LLM schema's
`is_key_session`.
"""
import itertools
from datetime import date, timedelta

from services.supabase.plan_writer import _removal_rank, plan_shift_layout

START = "2026-01-01"


def day(offset: int, *, rest: bool = False, key: bool = False, focus: str = "Session") -> dict:
    return {
        "id": offset,
        "date": (date.fromisoformat(START) + timedelta(days=offset)).isoformat(),
        "is_rest": rest,
        "is_key": key,
        "focus": focus,
    }


def week(**overrides: dict) -> list[dict]:
    """Seven ordinary non-key training days, with individual offsets overridden by kwargs
    like `d2={"rest": True}`.
    """
    return [day(i, **overrides.get(f"d{i}", {})) for i in range(7)]


def new_dates(kept: list[dict]) -> dict[str, str]:
    return {r["date"]: r["_new_date"] for r in kept}


class TestRemovalRank:
    def test_rest_days_go_first(self):
        assert _removal_rank(day(0, rest=True)) == 0

    def test_non_key_sessions_go_second(self):
        assert _removal_rank(day(0)) == 1

    def test_key_sessions_are_never_dropped(self):
        assert _removal_rank(day(0, key=True)) is None

    def test_a_rest_day_flagged_key_is_still_droppable(self):
        # is_rest is checked first, and a "key rest day" is not a thing worth protecting.
        assert _removal_rank(day(0, rest=True, key=True)) == 0


class TestShiftWithoutEvents:
    def test_every_day_moves_by_the_shift_amount(self):
        kept, dropped, warnings = plan_shift_layout(week(), [], START, 1)

        assert dropped == []
        assert warnings == []
        assert new_dates(kept) == {
            "2026-01-01": "2026-01-02",
            "2026-01-02": "2026-01-03",
            "2026-01-03": "2026-01-04",
            "2026-01-04": "2026-01-05",
            "2026-01-05": "2026-01-06",
            "2026-01-06": "2026-01-07",
            "2026-01-07": "2026-01-08",
        }

    def test_order_is_preserved(self):
        kept, _, _ = plan_shift_layout(week(), [], START, 3)
        assert [r["date"] for r in kept] == sorted(r["date"] for r in kept)
        assert [r["_new_date"] for r in kept] == sorted(r["_new_date"] for r in kept)

    def test_relative_spacing_is_unchanged(self):
        kept, _, _ = plan_shift_layout(week(), [], START, 4)
        olds = [date.fromisoformat(r["date"]) for r in kept]
        news = [date.fromisoformat(r["_new_date"]) for r in kept]
        old_gaps = [(b - a).days for a, b in itertools.pairwise(olds)]
        new_gaps = [(b - a).days for a, b in itertools.pairwise(news)]
        assert old_gaps == new_gaps

    def test_nothing_is_dropped_when_there_is_no_event_to_protect(self):
        rows = week(d1={"rest": True}, d3={"rest": True})
        kept, dropped, _ = plan_shift_layout(rows, [], START, 2)
        assert len(kept) == 7
        assert dropped == []


class TestEventProtection:
    def test_race_stays_on_its_real_date(self):
        # Race on Jan 5; a rest day on Jan 2 pays for the one-day shift.
        rows = week(d1={"rest": True}, d4={"key": True, "focus": "Race"})
        kept, dropped, warnings = plan_shift_layout(rows, ["2026-01-05"], START, 1)

        assert warnings == []
        assert [r["date"] for r in dropped] == ["2026-01-02"]
        assert new_dates(kept)["2026-01-05"] == "2026-01-05"

    def test_days_after_the_race_land_back_on_their_own_dates(self):
        rows = week(d1={"rest": True}, d4={"key": True, "focus": "Race"})
        kept, _, _ = plan_shift_layout(rows, ["2026-01-05"], START, 1)
        mapping = new_dates(kept)
        assert mapping["2026-01-06"] == "2026-01-06"
        assert mapping["2026-01-07"] == "2026-01-07"

    def test_rest_days_are_dropped_before_non_key_sessions(self):
        # Non-key session on Jan 2 (earlier), rest day on Jan 4 (later). Rank beats date.
        rows = week(d3={"rest": True}, d4={"key": True, "focus": "Race"})
        _, dropped, _ = plan_shift_layout(rows, ["2026-01-05"], START, 1)
        assert [r["date"] for r in dropped] == ["2026-01-04"]

    def test_earlier_day_wins_a_tie_within_the_same_rank(self):
        rows = week(d1={"rest": True}, d2={"rest": True}, d4={"key": True, "focus": "Race"})
        _, dropped, _ = plan_shift_layout(rows, ["2026-01-05"], START, 1)
        assert [r["date"] for r in dropped] == ["2026-01-02"]

    def test_a_multi_day_shift_frees_that_many_days(self):
        rows = week(d0={"rest": True}, d1={"rest": True}, d4={"key": True, "focus": "Race"})
        kept, dropped, warnings = plan_shift_layout(rows, ["2026-01-05"], START, 2)

        assert warnings == []
        assert sorted(r["date"] for r in dropped) == ["2026-01-01", "2026-01-02"]
        assert new_dates(kept)["2026-01-05"] == "2026-01-05"

    def test_key_sessions_are_never_dropped_to_protect_an_event(self):
        # Everything before the race is a key session, so nothing can be freed.
        rows = [day(i, key=True) for i in range(4)]
        rows.append(day(4, key=True, focus="Race"))
        kept, dropped, warnings = plan_shift_layout(rows, ["2026-01-05"], START, 1)

        assert dropped == []
        assert len(warnings) == 1
        assert "2026-01-05" in warnings[0]
        # The race moves rather than a key session being deleted.
        assert new_dates(kept)["2026-01-05"] == "2026-01-06"

    def test_partial_compression_warns_and_moves_the_event_by_the_remainder(self):
        # One rest day available, but a two-day shift to absorb.
        rows = [day(0, rest=True), day(1, key=True), day(2, key=True), day(3, key=True)]
        rows.append(day(4, key=True, focus="Race"))
        kept, dropped, warnings = plan_shift_layout(rows, ["2026-01-05"], START, 2)

        assert [r["date"] for r in dropped] == ["2026-01-01"]
        assert len(warnings) == 1
        assert "only 1 of 2" in warnings[0]
        assert new_dates(kept)["2026-01-05"] == "2026-01-06"


class TestMultipleEvents:
    def test_one_dropped_day_protects_every_following_event(self):
        # Races on Jan 4 and Jan 8, a rest day before each. Only ONE rest day should go:
        # once Race A is back on its real date the plan is in sync, so Race B needs no
        # further compression. Squeezing both segments would delete a rest day for nothing
        # and land Race B on Jan 7 — a day EARLIER than it actually is.
        rows = [
            day(0, rest=True),
            day(1),
            day(2),
            day(3, key=True, focus="Race A"),
            day(4, rest=True),
            day(5),
            day(6),
            day(7, key=True, focus="Race B"),
        ]
        kept, dropped, warnings = plan_shift_layout(
            rows, ["2026-01-04", "2026-01-08"], START, 1
        )

        assert warnings == []
        assert [r["date"] for r in dropped] == ["2026-01-01"]
        mapping = new_dates(kept)
        assert mapping["2026-01-04"] == "2026-01-04"
        assert mapping["2026-01-08"] == "2026-01-08"
        # The second rest day survives.
        assert "2026-01-05" in mapping

    def test_a_failure_before_one_event_does_not_affect_a_later_one(self):
        # Nothing droppable before Race A, but a rest day before Race B.
        rows = [
            day(0, key=True),
            day(1, key=True),
            day(2, key=True, focus="Race A"),
            day(3, rest=True),
            day(4),
            day(5, key=True, focus="Race B"),
        ]
        kept, dropped, warnings = plan_shift_layout(
            rows, ["2026-01-03", "2026-01-06"], START, 1
        )

        assert [r["date"] for r in dropped] == ["2026-01-04"]
        assert len(warnings) == 1
        assert "2026-01-03" in warnings[0]
        mapping = new_dates(kept)
        assert mapping["2026-01-03"] == "2026-01-04"  # Race A slipped
        assert mapping["2026-01-06"] == "2026-01-06"  # Race B still protected


class TestMultiSessionDays:
    """Since migration 045, a date can hold more than one row (different time_slot). The cursor
    that assigns _new_date must advance once per distinct date, not once per row, or same-day
    siblings get split apart across different new dates.
    """

    def _pair(self, offset: int, *, rest: bool = False, key: bool = False) -> list[dict]:
        base = day(offset, rest=rest, key=key)
        morning = {**base, "id": f"{offset}-morning", "time_slot": "morning"}
        evening = {**base, "id": f"{offset}-evening", "time_slot": "evening"}
        return [morning, evening]

    def test_same_day_siblings_land_on_the_same_new_date(self):
        rows = [*self._pair(0), day(1), day(2)]
        kept, dropped, _ = plan_shift_layout(rows, [], START, 1)

        assert dropped == []
        day0_new_dates = {r["_new_date"] for r in kept if r["date"] == day(0)["date"]}
        assert day0_new_dates == {"2026-01-02"}  # both siblings, one shared new date

    def test_cursor_advances_once_per_distinct_date_not_per_row(self):
        rows = self._pair(0) + self._pair(1) + [day(2)]
        kept, _, _ = plan_shift_layout(rows, [], START, 1)

        mapping = {r["date"]: r["_new_date"] for r in kept}
        # Three distinct old dates -> three distinct new dates, not five (len(rows)).
        assert set(mapping.values()) == {"2026-01-02", "2026-01-03", "2026-01-04"}

    def test_dropping_one_sibling_does_not_touch_the_other(self):
        # A rest-flagged sibling can be dropped independently of its same-day, non-rest sibling.
        base = day(0)
        rest_sibling = {**base, "id": "0-morning", "time_slot": "morning", "is_rest": True}
        real_sibling = {**base, "id": "0-evening", "time_slot": "evening", "is_rest": False}
        rows = [rest_sibling, real_sibling, day(1), day(2), day(3, key=True, focus="Race")]
        kept, dropped, _ = plan_shift_layout(rows, ["2026-01-04"], START, 1)

        assert [r["id"] for r in dropped] == ["0-morning"]
        assert any(r["id"] == "0-evening" for r in kept)


class TestEdgeCases:
    def test_empty_plan_is_a_no_op(self):
        assert plan_shift_layout([], [], START, 1) == ([], [], [])

    def test_event_with_no_scheduled_row_still_compresses_before_it(self):
        # The race exists in the athlete's events but has no scheduled_days row of its own.
        rows = week(d1={"rest": True})
        kept, dropped, warnings = plan_shift_layout(rows, ["2026-01-05"], START, 1)

        assert [r["date"] for r in dropped] == ["2026-01-02"]
        assert warnings == []
        # Jan 5's own row is an ordinary training day here; it lands back on Jan 5.
        assert new_dates(kept)["2026-01-05"] == "2026-01-05"

    def test_event_before_the_whole_window_leaves_the_layout_intact(self):
        # shift_plan only passes events inside the shifted range, so an out-of-range event is
        # outside this function's contract. It still must not corrupt the layout: nothing is
        # dropped and every day shifts normally. (It does emit a warning about an event it
        # cannot protect, which is noise the caller's filtering prevents in practice.)
        rows = week(d1={"rest": True})
        kept, dropped, _ = plan_shift_layout(rows, ["2025-12-01"], START, 1)

        assert dropped == []
        assert new_dates(kept)["2026-01-01"] == "2026-01-02"
        assert len(kept) == 7

    def test_every_kept_row_gets_a_new_date(self):
        rows = week(d1={"rest": True}, d4={"key": True, "focus": "Race"})
        kept, _, _ = plan_shift_layout(rows, ["2026-01-05"], START, 1)
        assert all("_new_date" in r for r in kept)

    def test_kept_and_dropped_together_account_for_every_row(self):
        rows = week(d1={"rest": True}, d4={"key": True, "focus": "Race"})
        kept, dropped, _ = plan_shift_layout(rows, ["2026-01-05"], START, 1)
        assert len(kept) + len(dropped) == len(rows)
