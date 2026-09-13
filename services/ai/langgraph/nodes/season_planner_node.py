import json
import logging
from datetime import datetime

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.schemas import AgentOutput
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState
from services.ai.langgraph.utils.output_helper import extract_expert_output
from services.ai.model_config import ModelSelector
from services.ai.utils.plan_storage import FilePlanStorage
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff

from .node_base import (
    configure_node_tools,
    create_timing_entry,
    execute_node_with_error_handling,
    log_node_completion,
)
from .prompt_components import get_hitl_instructions, get_language_instructions, get_workflow_context
from .tool_calling_helper import handle_tool_calling_in_node

logger = logging.getLogger(__name__)

SEASON_PLANNER_SYSTEM_PROMPT = """You are a strategic season planner.
## Goal
Create strategic season plans for long-term athletic development.
## Principles
- Strategic: Focus on macro-cycles and phases.
- Adaptive: Use expert insights to tailor the plan.
- Systematic: Ensure logical progression towards goals.
- Deliberate: You have deep knowledge of real periodization science (linear, undulating/DUP,
  block, conjugate, and high-frequency/high-volume approaches for strength; polarized,
  threshold-focused, and pyramidal approaches for endurance/VO2max). Do not default to the
  first generic template that comes to mind. This is YOUR expert judgment call, not a
  question for the athlete — weigh named alternatives against this athlete's own data and
  commit to a choice, the way a real coach would, rather than asking them to pick."""

SEASON_PLANNER_USER_PROMPT = """Create a STRATEGIC, HIGH-LEVEL season plan (12-24 weeks).

## Inputs
- Athlete: {athlete_name}
- Date: ```json {current_date} ```
- Competitions: ```json {competitions} ```

## Hard Constraints & Recurring Session Requests
These are non-negotiable at the macro level too — do not design phases that would be impossible
to honor week-to-week (e.g. a phase requiring 6 sessions when only 3 days are available), and
make sure recurring session requests remain plannable throughout every phase, not just some.
```markdown
{planning_context}
```

## Expert Insights
### Metrics
```markdown
{metrics_insights}
```
### Activity
```markdown
{activity_insights}
```
### Physiology
```markdown
{physiology_insights}
```

## Task
Create a macro-cycle framework.
- **Integrate**: Use expert insights as your north star.
- **Strategize**: Define phases, themes, and focus areas.
- **Respect Boundaries**: Do NOT prescribe daily workouts (Weekly Planner's job).
- **Frequency vs Load**: When calling for smoother/controlled weekly training load, be explicit
  that this means smoothing total STRESS, not minimizing session COUNT — easy aerobic volume is
  a low-load way to sustain high session frequency and should be named as the tool for doing so
  wherever the athlete has asked for high frequency, rather than leaving "session count" ambiguous
  for the Weekly Planner to resolve.

## Output Requirements
Format as structured markdown.
1. **Phases**: Define phases (Base, Build, etc.) with goals and themes.
2. **Programming Methodology**: For BOTH strength and cardio/VO2max development, teach your
   reasoning explicitly:
   - Name 2-3 real, applicable periodization approaches for each (e.g. linear, undulating/DUP,
     block, conjugate, or high-frequency/high-volume for strength; polarized, threshold-focused,
     or pyramidal for cardio).
   - For each approach named, state its key trade-off for THIS athlete specifically — reference
     their training age, recent strength/performance trend, weekly session frequency, and
     timeline to their goal/competition.
   - State which approach (or blend) you are choosing and why, in plain language a self-coached
     athlete could later apply without you.
   - **Accessory work confirmation (required)**: Explicitly confirm the chosen approach retains
     meaningful accessory/isolation work alongside primary compound lifts, unless the athlete has
     explicitly asked to minimize it. State this as its own sentence, not folded into other text.
   Write for an athlete who wants to understand and eventually self-program — explain the "why,"
   not just the "what."
3. **Weekly Session Structure (required, concrete)**: Translate the Programming Methodology you
   just chose into an explicit, itemized structural spec — do not stop at naming the approach.
   - State exactly how many times per week each major lift/movement pattern will be trained (e.g.
     "Bench: 3x/week", "Squat: 2x/week"), grounded in the athlete's actual available session count
     from the Hard Constraints above and whatever training-age/strength-trend signal the Expert
     Insights provide. If no strength-benchmark or training-age signal is available in the inputs,
     say so explicitly (e.g. "no 1RM or training-age data provided — frequency below is derived
     from session count and equipment only") rather than inventing false specificity.
   - State how movement patterns combine into sessions where relevant (e.g. "Session 1: bench
     only; Session 2: bench + squat variant; Session 3: bench + posterior-chain variant" for a
     high-frequency/hybrid approach, or "Session 1: full upper; Session 2: full lower" for a
     simpler split). Choose whatever combination pattern actually follows from the approach you
     picked in item 2 — do not default to a generic Upper/Lower/Push-Pull split unless that split
     is genuinely what your chosen approach calls for for this athlete.
   - This is what the Weekly Planner will follow literally. Vague language like "train frequently"
     or "balance upper and lower" is not sufficient — use concrete counts and named combinations.
   - Keep this section itemized and terse (a short list per lift/pattern) — this is a spec to be
     followed, not additional prose to be read for flavor.
4. **Expert Rationale**: Explicitly reference how Metrics, Activity, and Physiology informed the plan.
5. **Constraints**: Qualitative constraints derived from experts.

**Stay high-level** for Phases and Constraints — that's still the map, not the turn-by-turn
navigation. **Weekly Session Structure** should be concrete and itemized but still compact — short
list entries, not paragraphs. Give **Programming Methodology** enough room to actually teach: a
few sentences per approach considered is appropriate and expected. **BE CONCISE everywhere else.**"""




async def season_planner_node(state: TrainingAnalysisState) -> dict[str, list | str]:
    logger.info("Starting season planner node")

    hitl_enabled = state.get("hitl_enabled", True)
    logger.info("Season planner node: HITL %s", "enabled" if hitl_enabled else "disabled")

    agent_start_time = datetime.now()

    tools = configure_node_tools(
        agent_name="season_planner",
        plot_storage=None,
        plotting_enabled=False,
    )

    system_prompt = (
        SEASON_PLANNER_SYSTEM_PROMPT +
        get_workflow_context("season_planner") +
        (get_hitl_instructions("season_planner") if hitl_enabled else "") +
        get_language_instructions(state.get("language"))
    )

    qa_messages_raw = state.get("season_planner_messages", [])
    qa_messages = []
    for msg in qa_messages_raw:
        if hasattr(msg, "type"):
            role = "assistant" if msg.type == "ai" else "user"
            qa_messages.append({"role": role, "content": msg.content})
        else:
            qa_messages.append(msg)

    existing_season_plan = ""
    try:
        storage = FilePlanStorage()
        loaded_plan = storage.load_plan(state["user_id"], "season_plan")
        if loaded_plan:
            existing_season_plan = loaded_plan
    except Exception as exc:
        logger.warning("Could not read existing season plan: %s", exc)

    planning_context_full = state.get("planning_context", "") or ""
    soft_prefs_idx = planning_context_full.find("=== SOFT PREFERENCES")
    season_planning_context = (
        planning_context_full[:soft_prefs_idx].strip() if soft_prefs_idx != -1 else planning_context_full
    )

    base_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": SEASON_PLANNER_USER_PROMPT.format(
            athlete_name=state["athlete_name"],
            current_date=json.dumps(state["current_date"], indent=2),
            competitions=json.dumps(state["competitions"], indent=2),
            planning_context=season_planning_context or "No specific constraints or recurring session requests.",
            metrics_insights=extract_expert_output(state.get("metrics_outputs"), "for_season_planner"),
            activity_insights=extract_expert_output(state.get("activity_outputs"), "for_season_planner"),
            physiology_insights=extract_expert_output(state.get("physiology_outputs"), "for_season_planner"),
        ) + (f"\n\n## Existing Season Plan\nWe have an existing season plan. Do NOT start from scratch. Review this plan against the new expert insights. If the plan is still valid, maintain the phase structure and just refine the details. Only trigger a full replan if the new data suggests the old plan is dangerously off-track.\n\n```markdown\n{existing_season_plan}\n```" if existing_season_plan else "")},
    ]

    base_llm = ModelSelector.get_llm(AgentRole.SEASON_PLANNER)

    llm_with_tools = base_llm.bind_tools(tools) if tools else base_llm

    async def call_season_planning():
        messages_with_qa = base_messages + qa_messages
        if tools:
            response = await handle_tool_calling_in_node(
                llm_with_tools=llm_with_tools,
                messages=messages_with_qa,
                tools=tools,
                max_iterations=15,
            )
        else:
            response = await llm_with_tools.ainvoke(messages_with_qa)

        content = response.content
        if isinstance(content, list):
            content = "\n".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in content
                if (isinstance(block, dict) and block.get("type") == "text") or isinstance(block, str)
            )
        return AgentOutput(output=str(content).strip())

    async def node_execution():
        agent_output = await retry_with_backoff(
            call_season_planning, AI_ANALYSIS_CONFIG, "Season Planning"
        )

        execution_time = (datetime.now() - agent_start_time).total_seconds()
        log_node_completion("Season planning", execution_time)

        return {
            "season_plan": agent_output.model_dump(),
            "timings": [create_timing_entry("season_planner", execution_time)],
        }

    return await execute_node_with_error_handling(
        node_name="Season planner",
        node_function=node_execution,
        error_message_prefix="Season planning failed",
    )
