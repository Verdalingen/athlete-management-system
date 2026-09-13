"""Tests for the pure parts of plan_drift.

The module's whole premise is that the FACTS behind a placement decision are mechanically
checkable even though the decision itself is the coach's. detect_pure_shift() is the one case
it resolves outright — every planned session completed at the same offset, nothing missed —
because there is no judgment left to make there, so a plain "I did everything a day late"
costs nothing and cannot be mis-authored. That makes its boundaries (what is NOT a pure shift)
the important thing to pin down.
"""
from collections import Counter

from services.supabase.plan_drift import activity_kind, detect_pure_shift


def planned(*items: tuple[str, str]) -> list[dict]:
    return [{"date": d, "session_type": t} for d, t in items]


def completed(**by_date: str | list) -> dict[str, Counter[str]]:
    """completed(d2026_01_05="run") -> {"2026-01-05": Counter({"run": 1})}"""
    out = {}
    for key, kinds in by_date.items():
        iso = key[1:].replace("_", "-")
        out[iso] = Counter({kinds: 1}) if isinstance(kinds, str) else Counter(kinds)
    return out


def completed_counts(**by_date: dict[str, int]) -> dict[str, Counter[str]]:
    """completed_counts(d2026_01_05={"run": 2}) -> {"2026-01-05": Counter({"run": 2})} — for
    tests that need real occurrence counts, not just presence.
    """
    return {key[1:].replace("_", "-"): Counter(counts) for key, counts in by_date.items()}


class TestActivityKind:
    def test_strength_training_maps_to_strength(self):
        assert activity_kind("strength_training") == "strength"

    def test_every_running_variant_maps_to_run(self):
        for t in ("running", "treadmill_running", "trail_running", "track_running",
                  "indoor_running"):
            assert activity_kind(t) == "run"

    def test_matching_is_case_insensitive(self):
        assert activity_kind("RUNNING") == "run"
        assert activity_kind("Strength_Training") == "strength"

    def test_unknown_activities_are_other(self):
        assert activity_kind("kayaking") == "other"

    def test_missing_activity_type_is_other(self):
        assert activity_kind(None) == "other"
        assert activity_kind("") == "other"

    def test_aerobic_substitutes_count_as_cross_not_other(self):
        # Mapping hiking to "other" made substituted sessions vanish from the analysis, so a
        # hike instead of intervals looked identical to having done nothing at all.
        for t in ("hiking", "walking", "cycling", "swimming", "rowing", "elliptical"):
            assert activity_kind(t) == "cross"


class TestPureShiftDetected:
    def test_everything_one_day_late_is_a_one_day_shift(self):
        p = planned(("2026-01-05", "run"), ("2026-01-07", "strength"))
        done = completed(d2026_01_06="run", d2026_01_08="strength")
        assert detect_pure_shift(p, done) == 1

    def test_a_larger_uniform_offset_is_detected(self):
        p = planned(("2026-01-05", "run"), ("2026-01-07", "strength"))
        done = completed(d2026_01_08="run", d2026_01_10="strength")
        assert detect_pure_shift(p, done) == 3

    def test_a_single_planned_session_can_shift(self):
        p = planned(("2026-01-05", "run"))
        assert detect_pure_shift(p, completed(d2026_01_07="run")) == 2

    def test_extra_unplanned_activities_do_not_prevent_detection(self):
        # The athlete did the plan a day late and also went for a hike; still a pure shift.
        p = planned(("2026-01-05", "run"))
        done = completed(d2026_01_06=["run", "cross"], d2026_01_09="cross")
        assert detect_pure_shift(p, done) == 1

    def test_several_sessions_on_the_same_day_are_matched(self):
        p = planned(("2026-01-05", "run"), ("2026-01-05", "strength"))
        done = completed(d2026_01_06=["run", "strength"])
        assert detect_pure_shift(p, done) == 1

    def test_the_maximum_shift_is_inclusive(self):
        p = planned(("2026-01-05", "run"))
        assert detect_pure_shift(p, completed(d2026_01_12="run"), max_shift=7) == 7


class TestNotAPureShift:
    def test_an_empty_plan_is_not_a_shift(self):
        assert detect_pure_shift([], completed(d2026_01_06="run")) is None

    def test_training_on_plan_is_not_a_shift(self):
        p = planned(("2026-01-05", "run"), ("2026-01-07", "strength"))
        done = completed(d2026_01_05="run", d2026_01_07="strength")
        assert detect_pure_shift(p, done) is None

    def test_a_partial_match_is_a_judgment_call_not_a_shift(self):
        # One session on time, one a day late. Nothing here is safe to resolve automatically.
        p = planned(("2026-01-05", "run"), ("2026-01-07", "strength"))
        done = completed(d2026_01_05="run", d2026_01_08="strength")
        assert detect_pure_shift(p, done) is None

    def test_a_missed_session_is_not_a_shift(self):
        p = planned(("2026-01-05", "run"), ("2026-01-07", "strength"))
        done = completed(d2026_01_06="run")
        assert detect_pure_shift(p, done) is None

    def test_nothing_completed_at_all_is_not_a_shift(self):
        p = planned(("2026-01-05", "run"))
        assert detect_pure_shift(p, {}) is None

    def test_the_wrong_session_type_does_not_satisfy_a_plan(self):
        p = planned(("2026-01-05", "run"))
        done = completed(d2026_01_06="strength")
        assert detect_pure_shift(p, done) is None

    def test_a_cross_training_substitute_is_not_a_silent_shift(self):
        # Substitution is a real coaching decision; it must not be auto-resolved as a shift.
        p = planned(("2026-01-05", "run"))
        assert detect_pure_shift(p, completed(d2026_01_06="cross")) is None

    def test_a_shift_beyond_the_maximum_is_not_detected(self):
        p = planned(("2026-01-05", "run"))
        assert detect_pure_shift(p, completed(d2026_01_13="run"), max_shift=7) is None

    def test_sessions_completed_early_are_not_a_shift(self):
        # Only forward offsets are considered — training ahead of plan is not "running late".
        p = planned(("2026-01-05", "run"))
        assert detect_pure_shift(p, completed(d2026_01_04="run")) is None

    def test_different_offsets_per_session_is_not_a_shift(self):
        p = planned(("2026-01-05", "run"), ("2026-01-07", "strength"))
        done = completed(d2026_01_06="run", d2026_01_09="strength")
        assert detect_pure_shift(p, done) is None


class TestOccurrenceAware:
    """Since migration 045, a date can hold more than one planned session of the same type
    (e.g. two runs). completed_by_date is a Counter, not a set — presence isn't enough, the
    exact count must be matched, or a genuinely missed second same-day session would be
    invisible.
    """

    def test_two_same_day_same_type_sessions_both_need_a_completion_each(self):
        p = planned(("2026-01-05", "run"), ("2026-01-05", "run"))
        done = completed_counts(d2026_01_06={"run": 2})
        assert detect_pure_shift(p, done) == 1

    def test_only_one_of_two_same_day_completions_is_not_a_shift(self):
        # Two runs planned, only one actually completed that (shifted) day — a real miss, must
        # not be waved through just because "run" is present at all.
        p = planned(("2026-01-05", "run"), ("2026-01-05", "run"))
        done = completed_counts(d2026_01_06={"run": 1})
        assert detect_pure_shift(p, done) is None

    def test_extra_completions_beyond_what_was_planned_do_not_break_detection(self):
        p = planned(("2026-01-05", "run"))
        done = completed_counts(d2026_01_06={"run": 3})
        assert detect_pure_shift(p, done) == 1
