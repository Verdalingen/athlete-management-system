from services.ai.ai_settings import AgentRole
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState

from .data_summarizer_node import create_data_summarizer_node

LIFESTYLE_SUMMARIZER_SYSTEM_PROMPT = """## Goal
Extract behavioral and lifestyle patterns from recovery data that affect training readiness.
These are NOT physiological measurements — they are patterns of sleep consistency, stress load,
and daily readiness that reflect the athlete's life context around training.
## Principles
- Factual: Numbers and patterns only. No coaching interpretation.
- Pattern-focused: Trends and consistency matter more than single-day values.
- Transparent Compression: Show date ranges and variance explicitly."""

LIFESTYLE_SUMMARIZER_USER_PROMPT = """## Task
Extract and structure lifestyle and behavioral patterns for the Lifestyle Expert.
Focus on consistency, trends, and variability — not isolated measurements.

## Constraints
- NO physiological interpretation (that is the Physiology Expert's job).
- NO training load analysis (that is the Metrics Expert's job).
- Present raw patterns: when the athlete sleeps, how consistently, stress load trends.

## Required Structure
1. **Sleep Consistency**: bedtime/wake-time distribution, night-to-night variability, trend over past 4 weeks.
2. **Stress Load Pattern**: daily stress levels over time — sustained high stress vs spikes, recovery windows.
3. **Body Battery Trend**: daily start and end values — does the athlete arrive at training sessions recovered?
4. **Resting Heart Rate Trend**: slow upward drift (overreaching signal) vs stable baseline.
5. **Data Quality Notes**: gaps, missing days, unreliable readings.

## Input Data
```json
{data}
```

## Output Format
- Markdown tables with date ranges.
- Highlight variability (std dev or range) alongside averages.
- Flag any 3+ day windows of consistently poor readiness.

Deliver a compact, pattern-focused lifestyle summary."""


def extract_lifestyle_data(state: TrainingAnalysisState) -> dict:
    garmin_data = state["garmin_data"]
    recovery_indicators = garmin_data.get("recovery_indicators", [])
    physiological_markers = garmin_data.get("physiological_markers", {})

    sleep_patterns = [
        {
            "date": ind.get("date"),
            "sleeping_hours": ind.get("sleeping_hours"),
            "sleep_score": ind.get("sleep", {}).get("score") if ind.get("sleep") else None,
        }
        for ind in recovery_indicators
        if ind.get("sleeping_hours") or ind.get("sleep")
    ]

    stress_patterns = [
        {
            "date": ind.get("date"),
            "avg_stress": ind.get("average_stress_level"),
            "max_stress": ind.get("max_stress_level"),
            "stress_duration_minutes": round(ind.get("stress_duration_seconds", 0) / 60, 1)
            if ind.get("stress_duration_seconds") else None,
        }
        for ind in recovery_indicators
        if ind.get("average_stress_level") is not None
    ]

    return {
        "sleep_patterns": sleep_patterns,
        "stress_patterns": stress_patterns,
        "body_battery": garmin_data.get("body_battery", []),
        "resting_heart_rate": physiological_markers.get("resting_heart_rate", []),
        "hrv_trend": physiological_markers.get("hrv", {}).get("weekly_values", [])
        if physiological_markers.get("hrv") else [],
    }


lifestyle_summarizer_node = create_data_summarizer_node(
    node_name="Lifestyle Summarizer",
    agent_role=AgentRole.LIFESTYLE_SUMMARIZER,
    data_extractor=extract_lifestyle_data,
    state_output_key="lifestyle_summary",
    agent_type="lifestyle_summarizer",
    system_prompt=LIFESTYLE_SUMMARIZER_SYSTEM_PROMPT,
    user_prompt=LIFESTYLE_SUMMARIZER_USER_PROMPT,
)
