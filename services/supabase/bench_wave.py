"""Deterministic bench-wave rep-scheme computation.

Replaces what used to be an LLM-followed prompt rule (see the removed "Bench Programming" /
"Bench Macro-Wave Progression" hard rules in weekly_planner_node.py) with a plain function, now
that barbell bench's sets/reps come from here rather than being LLM-authored. See
strength_session_templates (is_dynamic_bench=true rows) for where this plugs in.

The wave advances on SESSIONS PERFORMED, not on calendar time. The previous version computed
`((session_date - wave_start).days // 7) % 16`, which meant a three-week layoff still advanced
the wave from 10s to 5s as though the work had been done — periodisation drifting on the
calendar while the athlete wasn't training. Counting sessions also makes the wave immune to
plan shifts (see plan_writer.shift_plan), which is the point of sequence anchoring: move the
dates around all you like, the progression only moves when you actually bench.
"""
from __future__ import annotations

# One rep target per block, cycling 10 -> 8 -> 5 -> 3 and repeating.
_BLOCK_REPS = [10, 8, 5, 3]

# A block is "4 weeks of training as actually performed", expressed in sessions so the dose per
# block is constant rather than the elapsed time. Length therefore depends on how often THIS
# athlete lifts — hardcoding 12 (i.e. 3x/week) would give a 5x/week lifter a 2.4-week block and
# a 2x/week lifter a 6-week one. Callers pass the athlete's real cadence.
WEEKS_PER_BLOCK = 4
DELOAD_WEEKS_PER_BLOCK = 1
DEFAULT_SESSIONS_PER_WEEK = 3


def compute_bench_prescription(sessions_completed: int, sessions_per_week: int | None = None) -> dict:
    """Prescription for the Nth bench session of the wave (0-indexed).

    ``sessions_per_week`` is this athlete's real strength cadence; it sets block length so the
    wave means the same thing regardless of training frequency.

    ``sessions_completed`` is how many bench sessions precede this one since the wave start —
    real completed sessions for dates in the past, completed + scheduled-in-between for future
    dates (see plan_writer.expand_strength_session_slots, which projects it forward).

    10s -> 8s -> 5s -> 3s, each held for a full block, then repeats identically. Real
    progression is heavier weight at the same rep targets over successive cycles — this system
    has never prescribed weight (the athlete self-selects via RIR), so the rep-scheme shape was
    never actually the thing carrying long-term progression; that's now tracked by the
    weight-recommendation feature (web/lib/strength.ts: getWeightRecommendation), driven by real
    completed performance.

    Revisit whether the rep-scheme itself should eventually escalate (e.g. toward a genuine
    near-max single in a later cycle) if real usage over several cycles suggests a flat repeat
    isn't enough — deliberately not built now, see project_bench_and_strength_structure_redesign
    memory for the reasoning.
    """
    per_week = max(1, int(sessions_per_week or DEFAULT_SESSIONS_PER_WEEK))
    per_block = WEEKS_PER_BLOCK * per_week
    deload_sessions = DELOAD_WEEKS_PER_BLOCK * per_week

    index = max(0, int(sessions_completed))
    cycle_position = index % (per_block * len(_BLOCK_REPS))
    block, session_in_block = divmod(cycle_position, per_block)
    reps = _BLOCK_REPS[block]
    is_deload = session_in_block >= per_block - deload_sessions
    return {
        "sets": 3 if is_deload else 4,
        "reps_min": reps,
        "reps_max": reps,
        "rir": 2,
    }
