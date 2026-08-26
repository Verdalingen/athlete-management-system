"""Tests for the generic progression engine.

services/scheduling/progression.py is the generalized form of bench_wave.py's
fixed 10-8-5-3 wave. The main thing worth pinning: an equivalent
ProgressionScheme reproduces bench_wave.compute_bench_prescription's output
exactly, session for session — this module is meant to be a superset, not a
rewrite, so bench_wave.py stays untouched and this is the proof the two agree.
"""
from datetime import date

import pytest

from services.scheduling.program_spec import ProgressionScheme
from services.scheduling.progression import (
    compute_progression_phase,
    compute_progression_phase_at_date,
)
from services.supabase.bench_wave import compute_bench_prescription

BENCH_EQUIVALENT_SCHEME = ProgressionScheme(
    session_type_key="strength-a",
    anchor_mode="sessions_completed",
    anchor_date=date(2026, 1, 1),
    sessions_per_week=3,
    weeks_per_block=4,
    deload_weeks_per_block=1,
    phases=[
        {"reps_min": 10, "reps_max": 10, "sets": 4, "rir": 2},
        {"reps_min": 8, "reps_max": 8, "sets": 4, "rir": 2},
        {"reps_min": 5, "reps_max": 5, "sets": 4, "rir": 2},
        {"reps_min": 3, "reps_max": 3, "sets": 4, "rir": 2},
    ],
    deload_overrides={"sets": 3},
)


class TestMatchesBenchWave:
    def test_reps_cycle_matches_bench_wave_across_two_full_cycles(self):
        for n in range(96):
            bench = compute_bench_prescription(n, 3)
            generic = compute_progression_phase(BENCH_EQUIVALENT_SCHEME, n)
            assert generic["reps_min"] == bench["reps_min"]
            assert generic["reps_max"] == bench["reps_max"]
            assert generic["sets"] == bench["sets"]

    def test_deload_flag_matches_bench_wave_deload_weeks(self):
        for n in range(48):
            bench = compute_bench_prescription(n, 3)
            generic = compute_progression_phase(BENCH_EQUIVALENT_SCHEME, n)
            assert generic["is_deload"] == (bench["sets"] == 3)


class TestBlockProgression:
    def test_cycle_repeats_after_four_blocks(self):
        for n in range(48):
            a = compute_progression_phase(BENCH_EQUIVALENT_SCHEME, n)
            b = compute_progression_phase(BENCH_EQUIVALENT_SCHEME, n + 48)
            assert a == b

    def test_negative_or_zero_sessions_completed_starts_at_first_phase(self):
        assert compute_progression_phase(BENCH_EQUIVALENT_SCHEME, 0)["reps_min"] == 10
        assert compute_progression_phase(BENCH_EQUIVALENT_SCHEME, -5)["reps_min"] == 10

    def test_different_cadence_changes_block_length_not_shape(self):
        # 5x/week means a 20-session block instead of 12 — the wave still
        # covers the same 10/8/5/3 shape, just over more sessions.
        five_per_week = BENCH_EQUIVALENT_SCHEME.model_copy(update={"sessions_per_week": 5})
        assert compute_progression_phase(five_per_week, 0)["reps_min"] == 10
        assert compute_progression_phase(five_per_week, 19)["reps_min"] == 10
        assert compute_progression_phase(five_per_week, 20)["reps_min"] == 8


class TestCalendarAnchoredMode:
    def test_wrong_mode_raises(self):
        with pytest.raises(ValueError):
            compute_progression_phase_at_date(BENCH_EQUIVALENT_SCHEME, date(2026, 2, 1))

    def test_advances_by_calendar_time(self):
        scheme = BENCH_EQUIVALENT_SCHEME.model_copy(
            update={"anchor_mode": "calendar_date", "sessions_per_week": None}
        )
        first_block = compute_progression_phase_at_date(scheme, date(2026, 1, 15))
        later_block = compute_progression_phase_at_date(scheme, date(2026, 2, 15))
        assert first_block["reps_min"] == 10
        assert later_block["reps_min"] == 8

    def test_mismatched_mode_raises(self):
        with pytest.raises(ValueError):
            compute_progression_phase(
                BENCH_EQUIVALENT_SCHEME.model_copy(update={"anchor_mode": "calendar_date"}), 0
            )
