from services.ai.ai_settings import AgentRole
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState

from .data_summarizer_node import create_data_summarizer_node

ACTIVITY_SUMMARIZER_SYSTEM_PROMPT = """## Goal
Extract and structure training activity data with factual precision.
## Principles
- Be objective: Present data without interpretation.
- Be precise: Preserve exact metrics and units.
- Be structured: Use consistent formatting and transparent compression."""

ACTIVITY_SUMMARIZER_USER_PROMPT = """## Task
Objectively describe the athlete's recent training activities.

## Constraints
- STRICTLY NO interpretation or coaching advice.
- Use transparent compression for long tails (summarize repetitive patterns with windows or ranges).

## Required Structure
1. **All Activities Table**: compact table for every activity (date, type, duration, distance, elevation, avg HR, avg pace/power).
2. **Key Sessions**: deep dives ONLY for key sessions (intensity/novelty/anomaly).
3. **Zone Distributions**: summarize distributions in tables.

## Input Data
```json
{data}
```

## Key Session Template (Endurance)
# Activity: [Date - Type]

## Overview
* Duration: [time]
* Distance: [distance]
* Elevation: [elevation]
* Avg HR: [HR] | Avg Pace/Power: [pace/power]

## Lap Details
| Lap | Dist | Time | Pace | Avg HR | Max HR | ... |
|-----|------|------|------|--------|--------|-----|
| 1   | ...  | ...  | ...  | ...    | ...    | ... |

## Key Session Template (Strength)
# Activity: [Date - Strength]

## Overview
* Duration: [total time] | Active: [active time] | Rest: [rest time]
* Avg HR: [HR] | Calories: [cal]

## Exercise Sets
| # | Exercise | Reps | Weight (kg) | Duration (s) |
|---|----------|------|-------------|--------------|
| 1 | ...      | ...  | ...         | ...          |

Note: when wkt_step_index is non-null, the exercise came from a coach-planned workout and the name is reliable.
When wkt_step_index is null, the exercise was auto-detected by Garmin (probabilistic) — treat the label as approximate.
Omit REST sets from the table; summarise total rest time in the overview."""


def extract_activity_data(state: TrainingAnalysisState) -> dict:
    return state["garmin_data"].get("recent_activities", [])


activity_summarizer_node = create_data_summarizer_node(
    node_name="Activity Summarizer",
    agent_role=AgentRole.SUMMARIZER,
    data_extractor=extract_activity_data,
    state_output_key="activity_summary",
    agent_type="activity_summarizer",
    system_prompt=ACTIVITY_SUMMARIZER_SYSTEM_PROMPT,
    user_prompt=ACTIVITY_SUMMARIZER_USER_PROMPT,
)
