"""Deterministic (non-LLM) pieces of a ProgramSpec, built from real Supabase data.

Strength session types and the 48h leg-spacing floor are real saved data / a
physiological safety constant, not a coaching judgment call — Python owns them
outright so the season planner never has to (or gets a chance to) reinvent them.
Shared by services/ai/langgraph/nodes/season_planner_node.py (the live pipeline)
and scripts/bootstrap_program_spec.py (the manual bootstrap tool), so there is
exactly one implementation of "what does this athlete's real strength setup look
like as a ProgramSpec fragment."

See services/scheduling/program_spec.py for the schema and the plan this shipped
under (Phase 3+4: wiring ProgramSpec + the solver into the live pipeline).
"""
from __future__ import annotations

from services.scheduling.program_spec import (
    ProgramSessionType,
    SpacingConstraint,
    WeeklyTarget,
)

# garmin_category values that count as leg work, for deciding which strength
# slots carry legs — confirmed by querying strength_session_templates directly
# (see memory project_leg_spacing_structural_limit). Never infer this from slot
# names or recurring_session_requests description text; both have been wrong.
LEG_GARMIN_CATEGORIES = {"SQUAT", "LUNGE", "HIP_RAISE", "DEADLIFT", "CALF_RAISE"}


def _slot_carries_legs(templates: list[dict], slot: str) -> bool:
    return any(
        (row.get("garmin_category") or "").upper() in LEG_GARMIN_CATEGORIES
        for row in templates
        if row.get("slot") == slot
    )


def build_deterministic_session_types(
    strength_templates: list[dict],
) -> list[ProgramSessionType]:
    """One ProgramSessionType per real strength slot (A/B/C, ...).

    Category is 'leg-strength' or 'upper-strength' depending on whether the
    slot's saved template includes any leg-carrying exercise. Every real
    strength session is treated as key — confirmed against live
    scheduled_days.is_key_session data (see scripts/bootstrap_program_spec.py's
    original comment on this). Never LLM-authored: this is real saved athlete
    data, not a periodization choice.
    """
    slots: dict[str, dict] = {}
    for row in strength_templates:
        slot = row.get("slot")
        if slot and slot not in slots:
            slots[slot] = row

    session_types: list[ProgramSessionType] = []
    for slot in sorted(slots):
        slot_name = slots[slot].get("slot_name") or f"Strength {slot}"
        category = "leg-strength" if _slot_carries_legs(strength_templates, slot) else "upper-strength"
        session_types.append(
            ProgramSessionType(
                key=f"strength-{slot.lower()}",
                category=category,
                label=slot_name,
                session_kind="strength",
                is_key=True,
            )
        )
    return session_types


def build_deterministic_weekly_targets(
    session_types: list[ProgramSessionType],
    recurring_session_requests: list[dict],
) -> tuple[list[WeeklyTarget], str | None]:
    """One WeeklyTarget(min=max=1) per strength session type, when it's expressible.

    Only generated when the athlete's real strength cadence (count of 'must'
    strength recurring_session_requests) matches the number of saved strength
    slots — the common case, and the only one that's actually expressible
    today: ProgramSpec has no "rotate fairly across weeks" rule type yet (a
    known, pre-existing vocabulary gap — see the plan's "Known limitation"
    note), so a cadence/slot-count mismatch can't be turned into a
    deterministic per-slot target without either being infeasible (cadence <
    slot count) or silently under-committing (cadence > slot count).

    Returns (targets, mismatch_note) — mismatch_note is None when they match,
    otherwise a human-readable string meant to be surfaced to the season
    planner (and stored in the spec's rationale) rather than silently guessed.
    """
    strength_types = [st for st in session_types if st.session_kind == "strength"]
    strength_cadence = sum(
        1
        for r in recurring_session_requests
        if r.get("session_type") == "strength" and r.get("importance") == "must"
    )

    if strength_cadence != len(strength_types):
        note = (
            f"Athlete's recurring strength cadence ({strength_cadence}/week) does not match "
            f"the number of saved strength slots ({len(strength_types)}) — ProgramSpec has no "
            "rotate-fairly-across-weeks rule type yet, so per-slot weekly targets were not "
            "auto-generated for strength here. The season planner should account for this "
            "explicitly (e.g. via its own weekly_targets) rather than assume even rotation."
        )
        return [], note

    targets = [
        WeeklyTarget(session_type_key=st.key, min_per_week=1, max_per_week=1)
        for st in strength_types
    ]
    return targets, None


def build_deterministic_leg_spacing_constraint(min_gap_hours: int = 48) -> SpacingConstraint:
    """The 48h leg-before-key-run rule, Python-owned.

    A physiological safety floor, not a periodization choice — the season
    planner may add further spacing_constraints on top, never weaken or
    remove this one.

    Contract: the season planner must label any hard/key run session type it
    authors with category 'key-run' for this constraint to actually bind —
    stated explicitly in the season-planner prompt.
    """
    return SpacingConstraint(
        from_category="leg-strength",
        to_category="key-run",
        min_gap_hours=min_gap_hours,
        direction="before",
    )


def build_deterministic_recovery_spacing_constraints(
    session_types: list[ProgramSessionType],
    min_gap_hours: int = 24,
) -> list[SpacingConstraint]:
    """Generalizes _check_strength_recovery_spacing into structural ProgramSpec data.

    weekly_planner_node.py's _check_strength_recovery_spacing is a general
    same-muscle-bucket adjacency check across ALL strength categories,
    broader than just leg-before-key-run. Every real strength slot includes
    bench-press/upper-body work by design
    (the "bench every session" split), so a plain leg/upper category split
    still under-represents true muscle overlap — the practical, safe
    generalization is one 'either'-direction constraint per unordered pair of
    strength categories present (including a category against itself), which
    is equivalent to "no two strength sessions of any kind on adjacent
    calendar days" given that every slot shares upper-body content. This makes
    the old check fully redundant for any spec built this way; it's kept in
    weekly_planner_node.py as defense-in-depth for the non-check-in path only.
    """
    strength_categories = sorted({st.category for st in session_types if st.session_kind == "strength"})
    return [
        SpacingConstraint(
            from_category=cat_a,
            to_category=cat_b,
            min_gap_hours=min_gap_hours,
            direction="either",
        )
        for i, cat_a in enumerate(strength_categories)
        for cat_b in strength_categories[i:]
    ]
