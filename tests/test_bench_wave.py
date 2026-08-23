"""Tests for the deterministic bench-wave prescription.

The wave advances on SESSIONS PERFORMED, not calendar time. That distinction is the whole
point of the module (a three-week layoff used to advance the wave from 10s to 5s as though
the work had been done), so most of what's worth pinning here is the block arithmetic:
where a rep target changes, where the deload falls, and that both scale with the athlete's
real cadence instead of assuming 3x/week.
"""
from services.supabase.bench_wave import (
    DEFAULT_SESSIONS_PER_WEEK,
    WEEKS_PER_BLOCK,
    compute_bench_prescription,
)


def reps_at(n: int, per_week: int | None = None) -> int:
    return compute_bench_prescription(n, per_week)["reps_min"]


def sets_at(n: int, per_week: int | None = None) -> int:
    return compute_bench_prescription(n, per_week)["sets"]


class TestBlockProgression:
    def test_rep_targets_cycle_ten_eight_five_three(self):
        # 3x/week => a 12-session block. Sample the first session of each block.
        assert [reps_at(n, 3) for n in (0, 12, 24, 36)] == [10, 8, 5, 3]

    def test_cycle_repeats_identically_after_four_blocks(self):
        # 4 blocks x 12 sessions = 48. Session 48 is session 0 again.
        for n in range(48):
            assert compute_bench_prescription(n, 3) == compute_bench_prescription(n + 48, 3)

    def test_rep_target_holds_for_a_whole_block(self):
        assert all(reps_at(n, 3) == 10 for n in range(0, 12))
        assert all(reps_at(n, 3) == 8 for n in range(12, 24))

    def test_block_boundary_is_exact(self):
        assert reps_at(11, 3) == 10
        assert reps_at(12, 3) == 8


class TestDeload:
    def test_last_week_of_each_block_is_a_deload(self):
        # 3x/week: sessions 0-8 are the three loading weeks, 9-11 the deload week.
        assert all(sets_at(n, 3) == 4 for n in range(0, 9))
        assert all(sets_at(n, 3) == 3 for n in range(9, 12))

    def test_deload_drops_sets_not_reps(self):
        loading = compute_bench_prescription(8, 3)
        deload = compute_bench_prescription(9, 3)
        assert deload["sets"] < loading["sets"]
        assert deload["reps_min"] == loading["reps_min"]
        assert deload["reps_max"] == loading["reps_max"]

    def test_every_block_ends_in_a_deload(self):
        for block_start in (0, 12, 24, 36):
            assert sets_at(block_start + 11, 3) == 3
            assert sets_at(block_start, 3) == 4


class TestCadenceScaling:
    """A block is a constant DOSE (4 weeks of training as performed), not a constant count.
    Hardcoding 12 sessions would give a 5x/week lifter a 2.4-week block."""

    def test_block_length_scales_with_cadence(self):
        # 2x/week => 8-session block, so the second block starts at session 8, not 12.
        assert reps_at(7, 2) == 10
        assert reps_at(8, 2) == 8
        # 5x/week => 20-session block.
        assert reps_at(19, 5) == 10
        assert reps_at(20, 5) == 8

    def test_deload_is_always_one_week_worth_of_sessions(self):
        for per_week in (1, 2, 3, 4, 5):
            per_block = WEEKS_PER_BLOCK * per_week
            deload_count = sum(1 for n in range(per_block) if sets_at(n, per_week) == 3)
            assert deload_count == per_week

    def test_reps_sequence_is_the_same_shape_at_any_cadence(self):
        for per_week in (1, 2, 3, 5):
            per_block = WEEKS_PER_BLOCK * per_week
            first_of_each_block = [reps_at(b * per_block, per_week) for b in range(4)]
            assert first_of_each_block == [10, 8, 5, 3]


class TestInputHandling:
    def test_missing_cadence_falls_back_to_the_default(self):
        assert compute_bench_prescription(5, None) == compute_bench_prescription(
            5, DEFAULT_SESSIONS_PER_WEEK
        )

    def test_zero_cadence_falls_back_rather_than_dividing_by_zero(self):
        assert compute_bench_prescription(5, 0) == compute_bench_prescription(
            5, DEFAULT_SESSIONS_PER_WEEK
        )

    def test_negative_cadence_clamps_to_one_session_per_week(self):
        assert compute_bench_prescription(3, -5) == compute_bench_prescription(3, 1)

    def test_negative_session_count_clamps_to_the_start_of_the_wave(self):
        assert compute_bench_prescription(-10, 3) == compute_bench_prescription(0, 3)

    def test_rir_is_always_two(self):
        assert all(compute_bench_prescription(n, 3)["rir"] == 2 for n in range(0, 48))
