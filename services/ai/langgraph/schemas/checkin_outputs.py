"""Structured output for weekly_planner_node's check-in path (Phase 4).

Much smaller than WeeklyPlanOutput: solve_schedule() is now the sole authority
for which date gets which session, so the LLM's job shrinks to (a) translating
the athlete's free-text note into overrides the solver must honor, and (b)
authoring running-interval content for dates the solver has already assigned
as runs — never structural placement. No HITL union here: run_replan() always
sets hitl_enabled=False, so the HITL branch is dead code for check-ins
specifically (confirmed by reading planning_workflow.py).

Two separate top-level output models, not one combined schema, because (b)
depends on the solver's output, which depends on (a) — the LLM can't be asked
for run content on "whichever dates the solver places" in the same call that
decides the overrides feeding that same solve.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from services.ai.langgraph.schemas.agent_outputs import RunningSegment


class CheckinOverride(BaseModel):
    """One translated instruction that forces a specific date to a specific session type.

    Mirrors solve_schedule's pinned_events mechanism directly.
    """

    date: str = Field(..., description="ISO date YYYY-MM-DD.")
    session_type_key: str = Field(..., description="A session_type_key defined in the active ProgramSpec — see the list given in the prompt.")
    reason: str = Field(..., description="Short justification, folded into coach_feedback.")


class CheckinTranslation(BaseModel):
    """The LLM's only structural judgment call in check-in mode."""

    overrides: list[CheckinOverride] = Field(
        default_factory=list,
        description="Forces specific dates to specific session types, translated from the "
        "athlete's note or detected drift. Only propose one where it's genuinely required — "
        "most check-ins need none; do not re-decide a date that's already fine as scheduled.",
    )
    assessment: str = Field(
        ...,
        description="3-4 concise bullet points: what the Garmin data shows, how it compares "
        "to the season plan's current phase, anything to watch, and what (if anything) is "
        "being adjusted and why. Becomes coach_feedback.",
    )


class CheckinSessionContent(BaseModel):
    """LLM-authored run content for ONE date the solver has already placed as a run-kind session.

    Content only, never placement.
    """

    date: str = Field(..., description="ISO date YYYY-MM-DD — must be one of the solver-placed run dates given in the prompt.")
    segments: list[RunningSegment] = Field(
        ...,
        description="Ordered segments covering the full session (warm-up, main effort, "
        "cool-down, drills/strides where applicable), same rules as before.",
    )


class CheckinTranslationOutput(BaseModel):
    """First check-in call: assess the week and translate the athlete's note into overrides.

    Before the solver runs, so before we know which dates it will place as runs.
    """

    translation: CheckinTranslation


class CheckinContentOutput(BaseModel):
    """Second check-in call, made only if the solver placed new run dates: author their content.

    Skipped entirely when there's nothing new to author (churn avoidance — an
    unaffected existing run day keeps its previously-written content).
    """

    running_content: list[CheckinSessionContent] = Field(
        default_factory=list,
        description="One entry per solver-placed run date needing structured content.",
    )
