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


class StrengthExercise(BaseModel):
    garmin_category: str = Field(..., description="Garmin category key e.g. BENCH_PRESS")
    garmin_exercise_key: str | None = Field(None, description="Exact Garmin FIT SDK exercise key from the catalog, e.g. 'BARBELL_BENCH_PRESS'. Must match an entry in the catalog provided in the prompt. Leave null only if no catalog entry fits.")
    display_name: str = Field(..., description="Human-readable name including equipment — e.g. 'Barbell Bench Press', 'DB OHP', 'DB Chest-Supported Row'. Never generic like 'Bench Press' or 'Row'.")
    sets: int = Field(..., description="Number of sets")
    reps: int = Field(..., description="Reps per set; use midpoint if a range is given")
    weight_kg: float | None = Field(None, description="Always null — Garmin's API does not support pre-setting weight via structured workout upload.")
    rest_seconds: int = Field(180, description="Rest between sets in seconds. 180 (3 min) for ALL exercises — this is the floor, never go lower.")
    rir: int | None = Field(None, description="Reps in reserve: how many reps remain before failure. 2-3 for hypertrophy/accessory work, 1-2 for heavy strength sets, 0 for all-out sets, null for deload/technique sessions where effort is self-regulated.")


class StrengthSessionData(BaseModel):
    date: str = Field(..., description="ISO date YYYY-MM-DD")
    name: str = Field(..., description="Short session name e.g. 'Strength A – Bench Focus'")
    exercises: list[StrengthExercise] = Field(default_factory=list)
    estimated_duration_secs: int = Field(3600, description="Estimated total session duration in seconds")


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
        description="True for hard/long/race sessions that should not be moved lightly"
    )
    is_rest: bool = Field(False, description="True for complete rest or very light active recovery")


class WeeklyPlanOutput(BaseModel):
    """Weekly planner output: markdown plan, structured strength sessions, and day-by-day schedule."""

    output: list[Question] | str = Field(
        ...,
        description="EITHER questions for HITL OR the complete markdown weekly plan"
    )
    strength_sessions: list[StrengthSessionData] | None = Field(
        None,
        description=(
            "Structured strength sessions extracted from the plan for Garmin watch upload. "
            "Populate only when output is the markdown plan (not HITL questions). "
            "Omit time-based elements (mobility, core circuits). "
            "Include only set×rep exercises."
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


class DailyCheckinOutput(BaseModel):
    """Output of the lightweight daily check-in node."""

    yesterday_status: Literal["completed", "missed", "partial", "rest_day", "no_data"] = Field(
        ..., description="Whether yesterday's planned session was completed"
    )
    yesterday_notes: str = Field(..., description="One sentence about what actually happened yesterday")
    today_session: str = Field(..., description="Today's workout in compact notation")
    today_focus: str = Field(..., description="1-2 word focus label for today")
    adjustments: list[str] = Field(
        default_factory=list,
        description="Human-readable list of changes made to the upcoming schedule"
    )
    updated_days: list[ScheduledDay] = Field(
        default_factory=list,
        description="Replacement entries for days that were adjusted (date-keyed; merge into stored schedule)"
    )
    summary_markdown: str = Field(..., description="Brief markdown daily briefing for the athlete")
