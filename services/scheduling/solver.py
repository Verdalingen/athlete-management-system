"""Generic, athlete-agnostic scheduler.

Given ANY ProgramSpec, find a placement of session types across a date window
that satisfies every rule, or prove it can't be done and say exactly which
rules conflict.

This replaces weekly_planner_node.py's approach of asking an LLM to draft a
whole multi-week schedule from scratch and then patching known failure modes
with hand-written, Adrian-specific Python (_fix_weekly_volume,
_fix_legs_before_hard_runs) that only sees the current window and has no memory
of prior weeks' compromises. Those functions are, in effect, an incomplete,
hand-rolled constraint solver; this module is a real one (Google OR-Tools
CP-SAT), driven entirely by ProgramSpec data instead of hardcoded assumptions.

Every rule (a weekly count target, a spacing constraint, the rest-day minimum)
is added to the model gated behind an "assumption" literal. When the model is
feasible, gating is a no-op — the assumptions are simply satisfied. When it's
infeasible, CP-SAT's SufficientAssumptionsForInfeasibility() returns exactly
which of those gated rules are jointly unsatisfiable, which is how
ScheduleResult.infeasible_reasons gets built. See services/scheduling/
program_spec.py for what a rule is allowed to say, and
tests/test_program_spec_solver.py for the regression test that reproduces the
2026-08-25 real-world failure as a proven infeasibility instead of a silent
per-week warning.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from ortools.sat.python import cp_model

from services.scheduling.program_spec import ProgramSpec

FREE = "__free__"


@dataclass
class ScheduleResult:
    feasible: bool
    assignments: dict[date, str] | None = None
    """date -> session_type_key, or FREE for an intentionally unscheduled day.
    Only set when feasible."""
    infeasible_reasons: list[str] | None = None
    """Human-readable descriptions of the conflicting rules. Only set when not
    feasible."""


def _week_monday(d: date) -> date:
    iso_year, iso_week, _ = d.isocalendar()
    return date.fromisocalendar(iso_year, iso_week, 1)


def _fully_known_weeks(known_dates: set[date]) -> dict[date, list[date]]:
    """Maps each Monday whose full Mon-Sun week is entirely covered.

    Only weeks entirely covered by known_dates are included, mapped to that
    week's 7 dates. Partial boundary weeks (e.g. a window that starts
    mid-week) are deliberately excluded — weekly_targets and rest_policy
    shouldn't be judged against a week we don't fully see.
    """
    weeks: dict[date, list[date]] = {}
    for d in known_dates:
        monday = _week_monday(d)
        if monday in weeks:
            continue
        full_week = [monday + timedelta(days=i) for i in range(7)]
        if all(day in known_dates for day in full_week):
            weeks[monday] = full_week
    return weeks


def _gap_hours(d1: date, d2: date) -> int:
    return abs((d2 - d1).days) * 24


def _spacing_orderings(direction: str, from_cat: str, to_cat: str) -> list[tuple[str, str]]:
    """Returns (earlier_category, later_category) pairs to forbid within the gap."""
    orderings: list[tuple[str, str]] = []
    if direction in ("before", "either"):
        orderings.append((from_cat, to_cat))
    if direction in ("after", "either"):
        orderings.append((to_cat, from_cat))
    return orderings


def solve_schedule(
    spec: ProgramSpec,
    window_dates: list[date],
    completed_ledger: dict[date, str] | None = None,
    pinned_events: dict[date, str] | None = None,
    time_limit_seconds: float = 10.0,
) -> ScheduleResult:
    """Finds a feasible session-type placement, or proves there isn't one.

    completed_ledger: known session_type_key for dates outside (or inside,
    e.g. today's already-performed session) window_dates — supplies context so
    weekly windows overlapping the boundary are judged correctly, and so
    already-happened days aren't re-decided.
    pinned_events: dates forced to a specific session_type_key regardless of
    what the solver would otherwise choose (e.g. a race day). Same mechanism as
    completed_ledger, kept as a separate parameter for caller clarity.
    """
    if not window_dates:
        raise ValueError("window_dates must be non-empty")
    if len(set(window_dates)) != len(window_dates):
        raise ValueError("window_dates must not contain duplicates")

    fixed: dict[date, str] = {**(completed_ledger or {}), **(pinned_events or {})}
    window_set = set(window_dates)
    known_dates = window_set | set(fixed.keys())

    model = cp_model.CpModel()
    type_keys = [st.key for st in spec.session_types]
    category_of = {st.key: st.category for st in spec.session_types}
    rest_keys = [st.key for st in spec.session_types if st.session_kind == "rest"]

    day_vars: dict[date, dict[str, cp_model.IntVar]] = {}
    for d in window_dates:
        if d in fixed:
            continue
        day_vars[d] = {key: model.new_bool_var(f"x_{d.isoformat()}_{key}") for key in type_keys}
        day_vars[d][FREE] = model.new_bool_var(f"x_{d.isoformat()}_{FREE}")
        model.add_exactly_one(list(day_vars[d].values()))

    def type_indicator(d: date, key: str):
        if d in fixed:
            return 1 if fixed[d] == key else 0
        return day_vars[d][key]

    def category_indicator(d: date, category: str):
        keys = [k for k in type_keys if category_of[k] == category]
        if not keys:
            return 0
        if d in fixed:
            return 1 if fixed[d] in keys else 0
        return sum(day_vars[d][k] for k in keys)

    assumptions: list[cp_model.IntVar] = []
    reasons_by_index: dict[int, str] = {}
    constant_violations: list[str] = []

    def add_gated(expr_le, bound: int, label: str) -> None:
        """Adds `expr_le <= bound` gated behind a fresh assumption literal.

        That lets an infeasible solve report this specific rule as a suspect.
        If expr_le is already a plain int (every contributing date is fixed —
        no variables involved), there's nothing left for the solver to search
        over: check it directly and, if violated, it's an unconditional
        conflict — no assignment of the remaining free days can fix it.
        """
        if isinstance(expr_le, int):
            if expr_le > bound:
                constant_violations.append(f"{label} (violated by fixed/history data alone)")
            return
        lit = model.new_bool_var(f"assume_{len(assumptions)}")
        model.add(expr_le <= bound).only_enforce_if(lit)
        assumptions.append(lit)
        reasons_by_index[lit.index] = label

    def add_weekly_and_rest_constraints() -> None:
        for monday, week_dates in _fully_known_weeks(known_dates).items():
            relevant_dates = [d for d in week_dates if d in window_set or d in fixed]
            for wt in spec.weekly_targets:
                total = sum(type_indicator(d, wt.session_type_key) for d in relevant_dates)
                add_gated(total, wt.max_per_week, f"weekly_target:{wt.session_type_key}:max<={wt.max_per_week} week-of-{monday}")
                add_gated(-total, -wt.min_per_week, f"weekly_target:{wt.session_type_key}:min>={wt.min_per_week} week-of-{monday}")

            if spec.rest_policy.min_rest_days_per_week > 0:
                rest_total = sum(category_indicator(d, category_of[k]) for d in week_dates for k in rest_keys) if rest_keys else 0
                add_gated(
                    -rest_total,
                    -spec.rest_policy.min_rest_days_per_week,
                    f"rest_policy:min>={spec.rest_policy.min_rest_days_per_week} week-of-{monday}",
                )

    def add_spacing_constraints() -> None:
        known_sorted = sorted(known_dates)
        for sc in spec.spacing_constraints:
            for earlier_cat, later_cat in _spacing_orderings(sc.direction, sc.from_category, sc.to_category):
                for i, d1 in enumerate(known_sorted):
                    for d2 in known_sorted[i + 1:]:
                        if _gap_hours(d1, d2) >= sc.min_gap_hours:
                            break
                        total = category_indicator(d1, earlier_cat) + category_indicator(d2, later_cat)
                        add_gated(
                            total,
                            1,
                            f"spacing:{earlier_cat}->{later_cat}:>={sc.min_gap_hours}h between {d1} and {d2}",
                        )

    def add_day_pin_constraints() -> list[cp_model.IntVar]:
        preferred_terms: list[cp_model.IntVar] = []
        for pin in spec.day_pins:
            pin_dates = [
                d for d in window_dates
                if d not in fixed and (
                    (pin.day_of_week and d.strftime("%A").lower() == pin.day_of_week) or
                    (pin.fixed_date and d == pin.fixed_date)
                )
            ]
            if pin.flexibility == "fixed":
                for d in pin_dates:
                    model.add(day_vars[d][pin.session_type_key] == 1)
            else:
                preferred_terms.extend(day_vars[d][pin.session_type_key] for d in pin_dates)
        return preferred_terms

    add_weekly_and_rest_constraints()
    add_spacing_constraints()
    preferred_terms = add_day_pin_constraints()
    if preferred_terms:
        model.maximize(sum(preferred_terms))

    if constant_violations:
        # Fixed/history data alone already breaks a rule — no assignment of
        # the remaining free days can fix that, so there's nothing to solve.
        return ScheduleResult(feasible=False, infeasible_reasons=sorted(set(constant_violations)))

    if assumptions:
        model.add_assumptions(assumptions)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    status = solver.solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        assignments: dict[date, str] = dict(fixed)
        for d in window_dates:
            if d in fixed:
                continue
            for key, var in day_vars[d].items():
                if solver.value(var):
                    assignments[d] = key
                    break
        return ScheduleResult(feasible=True, assignments=assignments)

    if status == cp_model.INFEASIBLE:
        culprits = solver.sufficient_assumptions_for_infeasibility()
        reasons = [reasons_by_index[i] for i in culprits if i in reasons_by_index]
        if not reasons:
            reasons = ["infeasible — could not isolate a specific conflicting rule"]
        return ScheduleResult(feasible=False, infeasible_reasons=sorted(set(reasons)))

    return ScheduleResult(
        feasible=False,
        infeasible_reasons=[f"solver returned unexpected status: {solver.status_name(status)}"],
    )
