from typing import Literal

from pydantic import BaseModel, Field


class Question(BaseModel):
    id: str = Field(..., description="Unique identifier (e.g., 'metrics_q1')")
    message: str = Field(..., description="Question text")
    context: str | None = Field(None, description="Additional context")
    message_type: str = Field("question", description="Type of message")


class AgentOutput(BaseModel):
    """Agent produces EITHER questions for HITL OR content for downstream consumers."""

    output: list[Question] | str = Field(
        ...,
        description="EITHER questions for HITL OR complete output for downstream consumers"
    )


class StrengthSessionSlot(BaseModel):
    """Which saved strength session template to use on a given date. Exercise content (identity,
    order, sets, reps) is populated automatically from the athlete's strength_session_templates —
    not authored by the model. Barbell bench's sets/reps come from a deterministic wave function
    (services/supabase/bench_wave.py) instead of the template. This is a scheduling decision only:
    which template slot, on which date — not what's in it."""
    date: str = Field(..., description="ISO date YYYY-MM-DD")
    slot: Literal["A", "B", "C"] = Field(..., description="Which of the athlete's 3 saved strength session templates to schedule on this date.")


class ScheduledDay(BaseModel):
    """One planned training day — the machine-readable form of a single row in the weekly plan."""

    date: str = Field(..., description="ISO date YYYY-MM-DD")
    day_name: str = Field(..., description="Day of week e.g. 'Monday'")
    session_type: Literal["run", "strength", "rest", "cross", "race"] = Field(
        ..., description="Primary session category"
    )
    focus: str = Field(..., description="1-2 word focus label e.g. 'VO2max', 'Tempo', 'Recovery', 'Rest'")
    description: str = Field(
        ...,
        description=(
            "Compact workout notation matching the plan "
            "(e.g. '4x(800m @ 3:50/km, 2min r)' or 'Bench 5×5 @ 97.5kg + row 4×8'). "
            "Empty string for rest days."
        )
    )
    is_key_session: bool = Field(
        False,
        description="True for hard/long/race sessions that should not be moved lightly. Most easy "
        "aerobic runs should be False here — this is not just for rest days, see is_rest."
    )
    is_rest: bool = Field(
        False,
        description="True for complete rest or very light active recovery. Easy Z1/Z2 training runs "
        "are NOT rest — they should have is_rest=False and is_key_session=False (a distinct middle "
        "category from both hard/key sessions and rest days)."
    )


class WeeklyPlanOutput(BaseModel):
    """Weekly planner output: markdown plan, structured strength sessions, and day-by-day schedule."""

    output: list[Question] | str = Field(
        ...,
        description="EITHER questions for HITL OR the complete markdown weekly plan"
    )
    strength_sessions: list[StrengthSessionSlot] | None = Field(
        None,
        description=(
            "For each strength day in the schedule, which template slot (A/B/C) to use — NOT the "
            "exercises themselves, which come from the athlete's saved template automatically. "
            "Populate only when output is the markdown plan (not HITL questions)."
        )
    )
    scheduled_days: list[ScheduledDay] | None = Field(
        None,
        description=(
            "One entry per day across the planning horizon. "
            "Populate only when output is the markdown plan. "
            "In check-in mode, leave empty if schedule_updated is False."
        )
    )
    coach_feedback: str | None = Field(
        None,
        description=(
            "Coach's written assessment for the athlete. Populate in check-in mode only. "
            "3-4 bullet points covering: what the Garmin data shows, how it compares to the "
            "season plan, anything to watch, and what (if anything) was adjusted and why."
        )
    )
    schedule_updated: bool = Field(
        True,
        description=(
            "True if the schedule was updated (scheduled_days populated). "
            "In check-in mode: set to False and leave scheduled_days empty if the athlete "
            "is on track and no changes are needed. Always True for full season replans."
        )
    )


## Daily nutrition targeting is handled outside this schema entirely — it's a deterministic
## template lookup against the existing `nutrition_targets` table (populated by the web app's
## on-demand /api/nutrition/targets/generate), not an LLM call. See
## services/supabase/plan_writer.py: sync_todays_nutrition_target().
