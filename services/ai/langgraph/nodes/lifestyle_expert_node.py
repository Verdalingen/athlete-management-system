import json
import logging
from datetime import datetime

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.schemas import LifestyleExpertOutputs
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState
from services.ai.langgraph.utils.message_helper import normalize_langchain_messages
from services.ai.model_config import ModelSelector
from services.ai.tools.plotting import PlotStorage
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff

from .node_base import (
    configure_node_tools,
    create_cost_entry,
    create_plot_entries,
    execute_node_with_error_handling,
    log_node_completion,
)
from .prompt_components import (
    get_hitl_instructions,
    get_plotting_instructions,
    get_workflow_context,
)
from .tool_calling_helper import handle_tool_calling_in_node

logger = logging.getLogger(__name__)

LIFESTYLE_SYSTEM_PROMPT_BASE = """## Goal
Analyze behavioral and lifestyle patterns to determine the athlete's real-world readiness context —
how life stress, sleep consistency, and accumulated fatigue affect what the athlete can absorb from training.

## Principles
- Readiness-first: The core output is a readiness signal — is the athlete arriving at training
  sessions recovered, or is there chronic lifestyle-induced fatigue?
- Pattern over point: A single bad sleep night is noise; a 5-day pattern of <6h is a signal.
- Non-physiological focus: You assess behavioral patterns and their training implications.
  Physiology Expert handles HRV adaptation, VO2max, etc.
- Gating role: Your `for_weekly_planner` output acts as a readiness gate — it tells the planner
  whether to load, maintain, or back off based on lifestyle signals.

## Domains
1. **Sleep Adequacy & Consistency**: Is total sleep sufficient and regular? Variability >2h/night is disruptive.
2. **Life Stress Load**: Chronic high stress (sustained >60) suppresses adaptation and increases injury risk.
3. **Recovery Completeness**: Does body battery recover fully between sessions? Sub-20 start is a red flag.
4. **Readiness Pattern**: Is the athlete consistently under-recovered entering key training days?
5. **Trend Direction**: Is lifestyle quality improving, stable, or deteriorating over the last 4 weeks?"""

LIFESTYLE_USER_PROMPT = """## Task
Analyze the lifestyle summary to assess readiness patterns and surface life-context signals
that should influence how the training plan is loaded.

## Constraints
- Focus ONLY on behavioral/lifestyle patterns (sleep, stress, body battery, RHR trend).
- Do NOT analyze training load numbers (Metrics Expert's job).
- Do NOT assess physiological adaptation or HRV recovery mechanisms (Physiology Expert's job).
- Do NOT prescribe training workouts — provide readiness context for the planners.

## Inputs
### Lifestyle Summary
{data}
### Context
- Competitions: ```json {competitions} ```
- Date: ```json {current_date} ```
- **User Context**: ``` {analysis_context} ```

## Output Requirements
Produce 3 structured fields. For EACH field:
- **Signals**: the behavioral pattern and its readiness implication
- **Evidence**: specific numbers, trends, date windows
- **Implications**: what this means for this receiver's decisions
- **Uncertainty**: data gaps, Garmin accuracy limitations

### 1. `for_synthesis` (Comprehensive Report)
- **Goal**: Describe the athlete's lifestyle context — are they in a position to absorb training?
- **Lead with**: overall readiness quality, key patterns, whether lifestyle is a limiting factor.

### 2. `for_season_planner` (12-24 Weeks)
- **Goal**: Identify structural lifestyle constraints that affect how hard each training block can be loaded.
- **Lead with**: chronic sleep debt, stress seasonality (e.g. work patterns), sustainable recovery capacity.

### 3. `for_weekly_planner` (Next 28 Days) — READINESS GATE
- **Goal**: This is the primary readiness gate. Tell the planner explicitly:
  (a) whether lifestyle readiness supports the planned training load,
  (b) specific days or periods where load should be reduced due to poor readiness signals,
  (c) any green-light windows where the athlete appears well-recovered for a hard block.
- **Be directive**: "Reduce load Tuesday–Thursday", "Green light for intensity this weekend", etc."""

LIFESTYLE_FINAL_CHECKLIST = """
## Final Checklist
- `for_weekly_planner` must contain explicit load-gating language (reduce / maintain / increase).
- All signals backed by specific data points from the lifestyle summary.
- Distinction maintained between behavioral patterns (your domain) and physiological adaptation."""


async def lifestyle_expert_node(state: TrainingAnalysisState) -> dict[str, list | str | dict]:
    logger.info("Starting lifestyle expert analysis node")

    plot_storage = PlotStorage(state["execution_id"])
    plotting_enabled = state.get("plotting_enabled", False)
    hitl_enabled = state.get("hitl_enabled", True)

    tools = configure_node_tools(
        agent_name="lifestyle",
        plot_storage=plot_storage,
        plotting_enabled=plotting_enabled,
    )

    system_prompt = (
        get_workflow_context("lifestyle")
        + LIFESTYLE_SYSTEM_PROMPT_BASE
        + (get_plotting_instructions("lifestyle") if plotting_enabled else "")
        + (get_hitl_instructions("lifestyle") if hitl_enabled else "")
        + LIFESTYLE_FINAL_CHECKLIST
    )

    base_llm = ModelSelector.get_llm(AgentRole.LIFESTYLE_EXPERT)
    llm_with_tools = base_llm.bind_tools(tools) if tools else base_llm
    llm_with_structure = llm_with_tools.with_structured_output(LifestyleExpertOutputs)

    agent_start_time = datetime.now()

    async def call_lifestyle_with_tools():
        qa_messages = normalize_langchain_messages(state.get("lifestyle_expert_messages", []))

        base_messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": LIFESTYLE_USER_PROMPT.format(
                    data=state.get("lifestyle_summary", "No lifestyle summary available"),
                    competitions=json.dumps(state["competitions"], indent=2),
                    current_date=json.dumps(state["current_date"], indent=2),
                    analysis_context=state["analysis_context"],
                ),
            },
        ]

        return await handle_tool_calling_in_node(
            llm_with_tools=llm_with_structure,
            messages=base_messages + qa_messages,
            tools=tools,
            max_iterations=15,
        )

    async def node_execution():
        agent_output = await retry_with_backoff(
            call_lifestyle_with_tools, AI_ANALYSIS_CONFIG, "Lifestyle Agent with Tools"
        )
        logger.info("Lifestyle expert analysis completed")

        execution_time = (datetime.now() - agent_start_time).total_seconds()
        plots, plot_storage_data, available_plots = create_plot_entries("lifestyle", plot_storage)
        log_node_completion("Lifestyle expert analysis", execution_time, len(available_plots))

        return {
            "lifestyle_outputs": agent_output,
            "plots": plots,
            "plot_storage_data": plot_storage_data,
            "costs": [create_cost_entry("lifestyle", execution_time)],
            "available_plots": available_plots,
        }

    return await execute_node_with_error_handling(
        node_name="Lifestyle expert analysis",
        node_function=node_execution,
        error_message_prefix="Lifestyle expert analysis failed",
    )
