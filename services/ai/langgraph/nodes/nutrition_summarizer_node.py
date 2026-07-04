from services.ai.ai_settings import AgentRole
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState

from .data_summarizer_node import create_data_summarizer_node

NUTRITION_SUMMARIZER_SYSTEM_PROMPT = """## Goal
Extract and organize nutrition-relevant data from two sources: Garmin (energy expenditure, body composition)
and MyFitnessPal (actual food intake). Present both sides factually for gap analysis.
## Principles
- Factual: Numbers only. No dietary advice or interpretation.
- Two-sided: Always separate expenditure data (Garmin) from intake data (MFP).
- Transparent Compression: Show date ranges and aggregation windows explicitly.
- Missing data: Flag explicitly — if MFP data is absent, note it prominently."""

NUTRITION_SUMMARIZER_USER_PROMPT = """## Task
Extract and structure all nutrition-relevant data for the Nutrition Expert.
Organize it into two clear sides: what the athlete BURNED (Garmin) and what they ATE (MFP).

## Constraints
- NO interpretation or dietary advice.
- Show missing data and gaps explicitly.
- Use transparent compression for long time series.

## Required Structure

### SIDE A — Energy Expenditure & Body State (Garmin)
1. **Body Composition Timeline**: weight_kg and any body-fat/muscle metrics with dates.
2. **Daily Caloric Expenditure**: total_calories, active_calories, bmr_calories per day.
3. **Energy Readiness**: body battery trend (daily end-of-day values).
4. **Training Load**: daily training load (for expenditure correlation).

### SIDE B — Food Intake (MyFitnessPal)
5. **Daily Intake Table**: date → calories, protein (g), carbs (g), fat (g), fiber (g), sugar (g).
6. **MFP Goals vs Actuals**: if goal data is present, show goal vs logged for each macro.
7. **Meal Breakdown**: summarize meal distribution if notable (e.g. skipped meals, large single meals).
8. **MFP Coverage**: how many days were logged, any gaps.

### SIDE C — Data Quality
9. **Coverage Notes**: date range for each source, missing days, suspicious values.

## Input Data
```json
{data}
```

## Output Format
- Markdown tables for time-series data.
- Explicit date ranges and units (kg, kcal, g).
- Mark MFP as "NOT AVAILABLE" clearly if absent.

Deliver a compact, factual dual-source summary ready for nutritional gap analysis."""


def extract_nutrition_data(state: TrainingAnalysisState) -> dict:
    garmin_data = state["garmin_data"]
    mfp_data = state.get("mfp_data") or {}

    recovery_indicators = garmin_data.get("recovery_indicators", [])
    caloric_expenditure = [
        {
            "date": ind.get("date"),
            "total_calories_burned": ind.get("total_calories"),
            "active_calories": ind.get("active_calories"),
            "bmr_calories": ind.get("bmr_calories"),
            "sleeping_hours": ind.get("sleeping_hours"),
        }
        for ind in recovery_indicators
        if any(ind.get(k) is not None for k in ("total_calories", "active_calories", "bmr_calories"))
    ]

    return {
        "garmin": {
            "body_composition": garmin_data.get("body_metrics", {}),
            "caloric_expenditure": caloric_expenditure,
            "body_battery": garmin_data.get("body_battery", []),
            "training_load_history": garmin_data.get("training_load_history", []),
            "daily_stats_snapshot": garmin_data.get("daily_stats", {}),
        },
        "myfitnesspal": mfp_data if mfp_data else "NOT AVAILABLE — athlete has not connected MyFitnessPal",
    }


nutrition_summarizer_node = create_data_summarizer_node(
    node_name="Nutrition Summarizer",
    agent_role=AgentRole.NUTRITION_SUMMARIZER,
    data_extractor=extract_nutrition_data,
    state_output_key="nutrition_summary",
    agent_type="nutrition_summarizer",
    system_prompt=NUTRITION_SUMMARIZER_SYSTEM_PROMPT,
    user_prompt=NUTRITION_SUMMARIZER_USER_PROMPT,
)
