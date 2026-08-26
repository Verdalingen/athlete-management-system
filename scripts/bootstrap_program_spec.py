"""One-off: build a ProgramSpec from Adrian's live current setup and check it.

Deliberately reproduces today's implicit configuration (whatever
athlete_profile.recurring_session_requests + strength_session_templates say
right now, including the 48h leg-spacing rule that today lives only as a
hardcoded constant in weekly_planner_node.py) rather than inventing a fix — the
point is to see the solver's explicit feasibility/infeasibility report for the
rules as they actually stand, then let Adrian decide what (if anything) needs
to change. See Phase 2 of the program-spec-solver plan and memory
project_leg_spacing_structural_limit for the full context.

Not wired into the replan_jobs queue — run manually:
    pixi run python scripts/bootstrap_program_spec.py [--write] [--rest-days N]

Without --write, only prints the spec and the solver's report (dry run).
--write inserts the built spec into program_specs as a status='draft',
source='bootstrap' row — never 'active', so it can't affect the live app.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta

from services.scheduling.program_spec import (
    DayPin,
    ProgramSessionType,
    ProgramSpec,
    RestPolicy,
    SpacingConstraint,
    WeeklyTarget,
)
from services.scheduling.solver import solve_schedule
from services.supabase.client import get_supabase

# The rule as it exists today, hardcoded in
# weekly_planner_node.py::_fix_legs_before_hard_runs — not stored anywhere in
# Supabase, so it can't be read from athlete_profile like everything else here.
LEG_SPACING_MIN_GAP_HOURS = 48

# garmin_category values that count as leg work, for deciding which strength
# slots carry legs (see the corrected finding in memory
# project_leg_spacing_structural_limit — don't infer this from slot names or
# recurring_session_requests description text, both have been wrong before).
LEG_GARMIN_CATEGORIES = {"SQUAT", "LUNGE", "HIP_RAISE", "DEADLIFT", "CALF_RAISE"}


def _slot_carries_legs(templates: list[dict], slot: str) -> bool:
    return any(row["garmin_category"] in LEG_GARMIN_CATEGORIES for row in templates if row["slot"] == slot)


def _is_key_session(description: str) -> bool:
    text = (description or "").lower()
    return "key session" in text and "not a key session" not in text


def build_program_spec(user_id: str, min_rest_days_per_week: int = 0) -> ProgramSpec:
    sb = get_supabase()
    profile = (
        sb.table("athlete_profile")
        .select("recurring_session_requests")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
        .data
        or {}
    )
    recurring = profile.get("recurring_session_requests") or []
    templates = (
        sb.table("strength_session_templates")
        .select("slot, garmin_category")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )

    session_types: list[ProgramSessionType] = []
    weekly_targets: list[WeeklyTarget] = []
    day_pins: list[DayPin] = []

    for req in recurring:
        key = req["id"]
        session_kind = req["session_type"]
        # Strength descriptions never say "key session" (only run descriptions do),
        # but every strength session is key in the real system (confirmed via
        # scheduled_days.is_key_session on live data) — the text heuristic only
        # applies to runs, where "not a key session" vs "key session" is explicit.
        is_key = session_kind == "strength" or _is_key_session(req.get("description", ""))

        if session_kind == "strength":
            slot = key.rsplit("-", 1)[-1].upper()
            category = "leg-strength" if _slot_carries_legs(templates, slot) else "upper-strength"
        elif is_key:
            category = "key-run"
        else:
            category = f"{session_kind}-easy"

        session_types.append(
            ProgramSessionType(key=key, category=category, label=req["label"], session_kind=session_kind, is_key=is_key)
        )
        if req.get("importance") == "must":
            weekly_targets.append(WeeklyTarget(session_type_key=key, min_per_week=1, max_per_week=1))
        if req.get("day_of_week"):
            day_pins.append(
                DayPin(
                    session_type_key=key,
                    day_of_week=req["day_of_week"],
                    flexibility=req.get("day_flexibility") or "preferred",
                )
            )

    return ProgramSpec(
        session_types=session_types,
        weekly_targets=weekly_targets,
        spacing_constraints=[
            SpacingConstraint(
                from_category="leg-strength",
                to_category="key-run",
                min_gap_hours=LEG_SPACING_MIN_GAP_HOURS,
                direction="before",
            )
        ],
        day_pins=day_pins,
        rest_policy=RestPolicy(min_rest_days_per_week=min_rest_days_per_week),
        horizon_weeks=6,
    )


def find_pinned_disruption(user_id: str, start: date) -> dict[date, str]:
    """Pin today's already-committed session, if any.

    Mirrors what a real weekly check-in would already know (today's
    committed session), same as the 2026-08-25 real check-in this reproduces.
    """
    sb = get_supabase()
    row = (
        sb.table("scheduled_days")
        .select("date, session_type")
        .eq("user_id", user_id)
        .eq("date", start.isoformat())
        .maybe_single()
        .execute()
        .data
    )
    if not row or row["session_type"] != "strength":
        return {}
    strength_row = (
        sb.table("strength_sessions")
        .select("slot")
        .eq("user_id", user_id)
        .eq("date", start.isoformat())
        .maybe_single()
        .execute()
        .data
    )
    if not strength_row:
        return {}
    return {start: f"strength-session-{strength_row['slot'].lower()}"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Insert the spec as a draft program_specs row")
    parser.add_argument("--rest-days", type=int, default=0, help="min_rest_days_per_week to bootstrap with")
    args = parser.parse_args()

    user_id = os.environ["SUPABASE_USER_ID"]
    spec = build_program_spec(user_id, min_rest_days_per_week=args.rest_days)

    print("=== Bootstrapped ProgramSpec ===")
    print(json.dumps(spec.model_dump(mode="json"), indent=2, default=str))

    start = date.today()
    window = [start + timedelta(days=i) for i in range(42)]
    pinned = find_pinned_disruption(user_id, start)

    result = solve_schedule(spec, window, pinned_events=pinned)
    print("\n=== Solver result ===")
    if result.feasible:
        print("FEASIBLE — a fully compliant 6-week schedule exists for the rules as they stand today.")
    else:
        print("INFEASIBLE — the rules as they stand today cannot all be satisfied at once:")
        for reason in result.infeasible_reasons or []:
            print(f"  - {reason}")

    if args.write:
        sb = get_supabase()
        sb.table("program_specs").insert(
            {
                "user_id": user_id,
                "effective_from": start.isoformat(),
                "status": "draft",
                "source": "bootstrap",
                "spec": spec.model_dump(mode="json"),
                "rationale": (
                    "Bootstrapped from live recurring_session_requests + strength_session_templates "
                    f"on {start.isoformat()}, reproducing the current implicit configuration "
                    f"(min_rest_days_per_week={args.rest_days}) rather than a fix. See the "
                    "solver result above/in logs for whether this configuration is feasible."
                ),
            }
        ).execute()
        print("\nInserted as a draft program_specs row (status='draft', source='bootstrap').")


if __name__ == "__main__":
    main()
