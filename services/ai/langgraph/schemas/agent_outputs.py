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


class RunningSegment(BaseModel):
    """One phase of a run: warm-up, interval, recovery, cool-down, or a continuous steady
    effort. Exactly one of duration_secs/distance_meters is set — time-based for warm-up/
    cool-down/jog-recovery, distance-based for interval reps."""
    segment_type: Literal["warmup", "interval", "recovery", "cooldown", "steady"] = Field(
        ..., description="What kind of phase this is."
    )
    zone: Literal["Z1", "Z2", "Z3", "Z4", "Z5"] | None = Field(
        None, description="Training zone letter. Required for every segment except a bare "
        "jog-recovery with no target effort."
    )
    duration_secs: int | None = Field(
        None, description="Time-based segment length in seconds. Set this OR distance_meters, "
        "not both."
    )
    distance_meters: int | None = Field(
        None, description="Distance-based segment length in meters. Set this OR duration_secs, "
        "not both."
    )
    pace_low: str | None = Field(
        None, description="Fast end of the pace range, 'M:SS' per km, from Current Training "
        "Paces. Omit only when Current Training Paces has no data for this zone."
    )
    pace_high: str | None = Field(
        None, description="Slow end of the pace range, 'M:SS' per km, from Current Training "
        "Paces."
    )
    repeat_count: int = Field(
        1, description="How many times this exact segment repeats consecutively, e.g. 6 for "
        "'6x400m'. 1 for non-repeated segments like warm-up/cool-down."
    )
    note: str | None = Field(None, description="Short free-text annotation, e.g. 'jog'.")


class RunningSessionData(BaseModel):
    """Structured running workout for one scheduled day — the single source of truth for that
    day's run. description on the matching ScheduledDay is rendered FROM these segments
    deterministically (services/garmin/running_uploader.py::render_running_description), not
    authored separately — do not try to make description and segments agree by hand, only the
    segments matter."""
    date: str = Field(..., description="ISO date YYYY-MM-DD, must match a 'run' scheduled_day.")
    segments: list[RunningSegment] = Field(
        ..., description="Ordered list of segments making up the full session, in execution "
        "order (e.g. warmup, then repeated interval+recovery, then cooldown)."
    )


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
            "(e.g. 'Bench 5×5 @ 97.5kg + row 4×8'). Empty string for rest days. "
            "For session_type='run', this field is IGNORED and overwritten deterministically "
            "from the matching RunningSessionData entry in running_sessions — do not spend "
            "effort authoring it precisely for run days, only the segments matter."
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
    running_sessions: list[RunningSessionData] | None = Field(
        None,
        description=(
            "For each 'run' scheduled_day, its structured segment breakdown (warm-up/interval/"
            "recovery/cooldown) — the source of truth for that day's run, used to render the "
            "display description and to push a structured workout to Garmin Connect. Populate "
            "only when output is the markdown plan, one entry per 'run' day in scheduled_days."
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
