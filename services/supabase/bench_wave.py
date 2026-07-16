"""Deterministic bench-wave rep-scheme computation.

Replaces what used to be an LLM-followed prompt rule (see the removed "Bench Programming" /
"Bench Macro-Wave Progression" hard rules in weekly_planner_node.py) with a plain function, now
that barbell bench's sets/reps come from here rather than being LLM-authored. See
strength_session_templates (is_dynamic_bench=true rows) for where this plugs in.
"""
from __future__ import annotations

from datetime import date


def compute_bench_prescription(session_date: date, wave_start_date: date) -> dict:
    """10s -> 8s -> 5s -> 3s, each held for a full 4-week block (16-week full cycle), then
    repeats identically. Real progression is heavier weight at the same rep targets over
    successive cycles — this system has never prescribed weight (the athlete self-selects via
    RIR), so the rep-scheme shape was never actually the thing carrying long-term progression;
    that's now tracked by the weight-recommendation feature (web/lib/strength.ts:
    getWeightRecommendation), driven by real completed performance.

    Revisit whether the rep-scheme itself should eventually escalate (e.g. toward a genuine
    near-max single in a later cycle) if real usage over several cycles suggests a flat repeat
    isn't enough — deliberately not built now, see project_bench_and_strength_structure_redesign
    memory for the reasoning.
    """
    week = ((session_date - wave_start_date).days // 7) % 16
    block, week_in_block = divmod(week, 4)
    reps = [10, 8, 5, 3][block]
    is_deload = week_in_block == 3
    return {
        "sets": 3 if is_deload else 4,
        "reps_min": reps,
        "reps_max": reps,
        "rir": 2,
    }
