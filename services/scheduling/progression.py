"""Generic deterministic phase progression, generalizing bench_wave.py.

bench_wave.compute_bench_prescription hardcodes a single wave (10-8-5-3 reps,
4-week blocks, 1-week deload) for barbell bench specifically. This module
implements the same algorithm — advance on sessions actually performed, not
calendar time, so plan shifts and layoffs don't desynchronize the wave — for any
ProgressionScheme, on any session type. bench_wave.py itself is left as-is; the
Phase 2 bootstrap script expresses Adrian's existing wave as one
ProgressionScheme and tests/test_progression.py confirms the two produce
identical output for an equivalent scheme, so this is a superset, not a rewrite.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from services.scheduling.program_spec import ProgressionScheme

if TYPE_CHECKING:
    from datetime import date


def compute_progression_phase(scheme: ProgressionScheme, sessions_completed: int) -> dict:
    """Prescription for the Nth session of this scheme's wave (0-indexed).

    sessions_completed is how many qualifying sessions precede this one since
    scheme.anchor_date — real completed sessions for dates in the past,
    completed + scheduled-in-between for future dates (mirrors
    plan_writer.expand_strength_session_slots's projection for bench_wave).
    Only meaningful for anchor_mode='sessions_completed'; see
    compute_progression_phase_at_date for 'calendar_date' anchoring.
    """
    if scheme.anchor_mode != "sessions_completed":
        raise ValueError(
            f"compute_progression_phase is for anchor_mode='sessions_completed', "
            f"got {scheme.anchor_mode!r} — use compute_progression_phase_at_date"
        )

    per_week = max(1, int(scheme.sessions_per_week or 1))
    per_block = scheme.weeks_per_block * per_week
    deload_sessions = scheme.deload_weeks_per_block * per_week

    index = max(0, int(sessions_completed))
    cycle_position = index % (per_block * len(scheme.phases))
    block, session_in_block = divmod(cycle_position, per_block)
    phase = dict(scheme.phases[block])
    is_deload = session_in_block >= per_block - deload_sessions
    if is_deload:
        phase.update(scheme.deload_overrides)
    phase["is_deload"] = is_deload
    return phase


def compute_progression_phase_at_date(scheme: ProgressionScheme, as_of: date) -> dict:
    """Calendar-anchored equivalent of compute_progression_phase.

    For schemes that must track a fixed date (e.g. a race taper) regardless of
    how many sessions were actually performed.
    """
    if scheme.anchor_mode != "calendar_date":
        raise ValueError(
            f"compute_progression_phase_at_date is for anchor_mode="
            f"'calendar_date', got {scheme.anchor_mode!r} — use "
            "compute_progression_phase"
        )

    block_days = scheme.weeks_per_block * 7
    deload_days = scheme.deload_weeks_per_block * 7
    elapsed_days = max(0, (as_of - scheme.anchor_date).days)

    cycle_position = elapsed_days % (block_days * len(scheme.phases))
    block, day_in_block = divmod(cycle_position, block_days)
    phase = dict(scheme.phases[block])
    is_deload = day_in_block >= block_days - deload_days
    if is_deload:
        phase.update(scheme.deload_overrides)
    phase["is_deload"] = is_deload
    return phase
