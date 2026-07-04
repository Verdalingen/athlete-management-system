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


class NutrientTimingAssessment(BaseModel):
    """Yesterday's pre/post workout protein window assessment."""

    pre_workout_protein_g: float | None = Field(None, description="Protein logged in pre-workout slot (g)")
    post_workout_protein_g: float | None = Field(None, description="Protein logged in post-workout slot (g)")
    pre_window_ok: bool = Field(False, description="True if pre-workout protein ≥ 20g")
    post_window_ok: bool = Field(False, description="True if post-workout protein ≥ 20g")
    note: str = Field("", description="One sentence of coaching feedback on yesterday's timing")


class NutritionDailyTarget(BaseModel):
    """Per-day nutrition targets generated by the daily check-in based on the planned session."""

    calories: int = Field(..., description="Total daily calorie target")
    protein_g: int = Field(..., description="Protein target in grams")
    carbs_g: int = Field(..., description="Carbohydrate target in grams")
    fat_g: int = Field(..., description="Fat target in grams")
    fiber_g: int = Field(30, description="Fiber target in grams")
    water_ml: int = Field(3000, description="Water intake target in ml")
    notes: str = Field(..., description="One sentence rationale tied to today's specific session and recovery state")


class MealIngredient(BaseModel):
    """One ingredient within a recommended meal."""

    food_name: str = Field(..., description="Ingredient name as used in the recipe, e.g. 'Grilled chicken breast', 'Baked cod fillet'")
    shopping_name: str = Field(
        ...,
        description=(
            "The generic grocery item a shopper would actually put on their shopping list — strip "
            "cooking method and doneness ('Baked cod fillet' -> 'Cod', 'Grilled chicken thigh' -> "
            "'Chicken thigh', 'Steamed broccoli' -> 'Broccoli'), and generalise personal-choice pantry "
            "staples away from a specific flavor/brand the shopper already has their own preference for "
            "('Chocolate whey protein powder' -> 'Protein powder', 'Vanilla almond milk' -> 'Almond milk'). "
            "Keep real distinct product types as-is (e.g. 'Rolled oats', 'Greek yogurt', 'Canned tuna')."
        ),
    )
    quantity_g: int = Field(..., description="Quantity in grams")
    serving_qty: float | None = Field(
        None,
        description=(
            "Natural piece/portion count when one applies, e.g. 2 (for '2 slices'), "
            "1 (for '1 banana'), 0.5 (for '½ avocado'). Omit for foods with no natural "
            "discrete unit (rice, leafy greens, oats)."
        ),
    )
    serving_label: str | None = Field(
        None,
        description="Singular unit name paired with serving_qty, e.g. 'slice', 'banana', 'avocado', 'egg'. Omit if serving_qty is omitted.",
    )
    calories: int = Field(..., description="Calories for this quantity")
    protein_g: float = Field(..., description="Protein in grams for this quantity")
    carbs_g: float = Field(..., description="Carbs in grams for this quantity")
    fat_g: float = Field(..., description="Fat in grams for this quantity")
    fiber_g: float = Field(0, description="Fiber in grams for this quantity")


class MealMicronutrients(BaseModel):
    """Estimated micronutrient totals for a recommended meal (best-effort, not USDA-verified)."""

    vitamin_c_mg: float = Field(0, description="Vitamin C in mg")
    vitamin_d_mcg: float = Field(0, description="Vitamin D in mcg")
    vitamin_a_mcg: float = Field(0, description="Vitamin A in mcg")
    calcium_mg: float = Field(0, description="Calcium in mg")
    iron_mg: float = Field(0, description="Iron in mg")
    magnesium_mg: float = Field(0, description="Magnesium in mg")
    potassium_mg: float = Field(0, description="Potassium in mg")
    zinc_mg: float = Field(0, description="Zinc in mg")
    sodium_mg: float = Field(0, description="Sodium in mg")
    sugar_g: float = Field(0, description="Sugar in grams")


class MealRecommendation(BaseModel):
    """One coach-recommended meal for a specific slot on a specific day."""

    meal_type: Literal["breakfast", "pre_workout", "lunch", "post_workout", "dinner", "snacks"] = Field(
        ..., description="Which meal slot this recommendation is for"
    )
    name: str = Field(..., description="Short meal name, e.g. 'Greek yogurt power bowl'")
    description: str = Field(..., description="1-2 sentence rationale tied to today's macros/session")
    ingredients: list[MealIngredient] = Field(
        ..., description="2-5 realistic ingredients with quantities and macros"
    )
    calories: int = Field(..., description="Total calories across all ingredients")
    protein_g: float = Field(..., description="Total protein in grams")
    carbs_g: float = Field(..., description="Total carbs in grams")
    fat_g: float = Field(..., description="Total fat in grams")
    fiber_g: float = Field(0, description="Total fiber in grams")
    micros: MealMicronutrients = Field(
        default_factory=MealMicronutrients,
        description="Best-effort micronutrient estimate for the whole meal",
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
    nutrition_target: NutritionDailyTarget | None = Field(
        None,
        description=(
            "Today's specific nutrition targets based on the planned session, recovery state, and training load. "
            "Always populate this — it is written to the database so the nutrition dashboard can display it."
        )
    )
    nutrient_timing: NutrientTimingAssessment | None = Field(
        None,
        description=(
            "Assessment of yesterday's pre/post workout protein windows. "
            "Populate only on training days when diary timing data is provided. "
            "Include a one-sentence coaching note."
        )
    )
    meal_recommendations: list[MealRecommendation] = Field(
        default_factory=list,
        description=(
            "One recommended meal per meal slot (breakfast, pre_workout, lunch, "
            "post_workout, dinner, snacks) sized to hit today's nutrition_target. "
            "Only include pre_workout/post_workout recommendations on training days. "
            "Always populate the rest — written to the database for the nutrition dashboard."
        ),
    )
