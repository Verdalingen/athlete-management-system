import logging
from datetime import datetime

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState
from services.ai.model_config import ModelSelector
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff

from .html_design_system import CSS_CLASS_REFERENCE, planning_shell, strip_code_fences
from .tool_calling_helper import extract_text_content

logger = logging.getLogger(__name__)

PLAN_FORMATTER_SYSTEM_PROMPT = """You are an HTML content author for an athletic training plan dashboard.

Your job is to transform markdown training plans into semantic HTML using a pre-defined design system.
The CSS is already embedded in the page — you write HTML structure only.

Rules:
- Output ONLY the HTML that goes inside <main class="page">...</main>.
- Do NOT output a full HTML document (no <!doctype>, <html>, <head>, <body>, <style>).
- Do NOT wrap output in markdown code fences.
- Use ONLY the CSS classes listed in the reference below.
- Preserve ALL workout details, dates, zones, adaptations, AND the Season Plan's Programming
  Methodology reasoning (the athlete's main educational content — do not summarize or shorten it).
- Section 1 — Season overview: use .card and .prose for high-level phases.
- Section 2 — Programming Methodology: use .card and .prose. Preserve this section IN FULL —
  every named periodization approach, its stated trade-off, the chosen approach and rationale,
  and the accessory-work confirmation sentence. Do not condense multi-sentence reasoning into a
  single bullet. This is the athlete's primary educational content for this page.
- Section 3 — 4-week plan: use .week-block + .week-grid + .day-cell for each week.
  * Add class "key-session" to hard workout days, "rest-day" to full rest days.
  * Inside each .day-cell: .day-name (Mon), .day-date (date), .day-focus (1-2 words),
    .day-workout (session description), .day-adaptation (if-tired note).
  * Add a .day-check with <input type="checkbox"> so the user can tick completed sessions.
- Section 4 — Intensity zones table: use <table> with <th>/<td>.

""" + CSS_CLASS_REFERENCE

PLAN_FORMATTER_USER_PROMPT = """Transform these training plans into HTML content for the planning dashboard.

## Season Plan
```markdown
{season_plan}
```

## 4-Week Plan
```markdown
{weekly_plan}
```

## Output
Return ONLY the inner HTML that goes between <main class="page"> and </main>.

Required structure:
1. <div class="section"> — Season Plan Overview (phases, goals, key constraints)
2. <div class="section"> — Programming Methodology (use .card + .prose; preserve this section's
   reasoning IN FULL — every approach named, its trade-off, the chosen approach and why, and the
   accessory-work confirmation sentence — this is the athlete's main educational content, do not
   summarize it away)
3. <div class="section"> per week (Week 1 … Week 4), each with a .week-grid of 7 .day-cell elements
4. <div class="section"> — Intensity Zones (table)
5. Include checkboxes on every session day so the user can track completion

Preserve ALL workout details, notation, focus words, adaptation notes, AND the Programming
Methodology reasoning in full — it is not optional supplementary content, it is a required section.

Preserve ALL workout details, notation, focus words, and adaptation notes."""


async def plan_formatter_node(state: TrainingAnalysisState) -> dict[str, list | str]:
    logger.info("Starting plan formatter node")

    try:
        agent_start_time = datetime.now()

        def get_content(field):
            value = state.get(field, "")
            if hasattr(value, "output"):
                output = value.output
                if isinstance(output, str):
                    return output
                raise ValueError("AgentOutput contains questions, not content. HITL interaction required.")
            if isinstance(value, dict):
                return value.get("output", value.get("content", value))
            return value or ""

        async def call_plan_formatting():
            response = await ModelSelector.get_llm(AgentRole.PLAN_FORMATTER).ainvoke([
                {"role": "system", "content": PLAN_FORMATTER_SYSTEM_PROMPT},
                {"role": "user", "content": PLAN_FORMATTER_USER_PROMPT.format(
                    season_plan=get_content("season_plan"),
                    weekly_plan=get_content("weekly_plan"),
                )},
            ])
            return extract_text_content(response)

        raw_content = await retry_with_backoff(
            call_plan_formatting, AI_ANALYSIS_CONFIG, "Plan Formatter"
        )

        inner_html = _extract_inner_html(strip_code_fences(raw_content))

        now = datetime.now()
        head, foot = planning_shell(
            title=f"Training Plan — {state.get('athlete_name', 'Athlete')} — {now.strftime('%Y-%m-%d')}",
            athlete=state.get("athlete_name", "Athlete"),
            date=now.strftime("%B %d, %Y"),
        )
        planning_html = head + "\n" + inner_html + "\n" + foot

        execution_time = (datetime.now() - agent_start_time).total_seconds()
        logger.info("Plan formatting completed in %.2fs", execution_time)

        return {
            "planning_html": planning_html,
            "timings": [
                {
                    "agent": "plan_formatter",
                    "execution_time": execution_time,
                    "timestamp": datetime.now().isoformat(),
                }
            ],
        }

    except Exception as exc:
        logger.exception("Plan formatter node failed")
        return {"errors": [f"Plan formatting failed: {exc!s}"]}


def _extract_inner_html(html: str) -> str:
    """If the model returned a full document despite instructions, extract just the body content."""
    lower = html.lower()
    if "<main" in lower and "</main>" in lower:
        start = lower.find("<main")
        end = lower.find("</main>") + len("</main>")
        block = html[start:end]
        return block[block.find(">") + 1 : block.rfind("</main>")]
    if "<body" in lower and "</body>" in lower:
        start = lower.find("<body")
        end = lower.find("</body>")
        block = html[start:end]
        return block[block.find(">") + 1:]
    return html
