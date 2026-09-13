import logging
from datetime import datetime

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState
from services.ai.model_config import ModelSelector
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff

from .html_design_system import CSS_CLASS_REFERENCE, analysis_shell, strip_code_fences
from .prompt_components import get_language_instructions
from .tool_calling_helper import extract_text_content

logger = logging.getLogger(__name__)

FORMATTER_SYSTEM_PROMPT = """You are an HTML content author for an athletic performance dashboard.

Your job is to transform markdown analysis content into semantic HTML using a pre-defined design system.
The CSS is already embedded in the page — you write HTML structure only.

Rules:
- Output ONLY the HTML that goes inside <main class="page">...</main>.
- Do NOT output a full HTML document (no <!doctype>, <html>, <head>, <body>, <style>).
- Do NOT wrap output in markdown code fences.
- Use ONLY the CSS classes listed in the reference below.
- Preserve every metric, score, and recommendation from the input.
- Structure with .section and .section-title for each major topic.
- Use .kpi-grid / .kpi for key numbers at the top.
- Use .card for insight blocks, .prose for free-form paragraphs.
- Use .badge-green / .badge-amber / .badge-red to colour-code status values.
- Use .alert-good / .alert-warn / .alert-bad for standout callouts.

""" + CSS_CLASS_REFERENCE

FORMATTER_USER_PROMPT = """Transform this training analysis into HTML content for the dashboard.

## Content
```markdown
{synthesis_result}
```

## Output
Return ONLY the inner HTML that goes between <main class="page"> and </main>.
Start with a .section containing a .kpi-grid of the most important numbers.
Then add one .section per major topic from the content.
Preserve ALL metrics, scores, advice, and details."""

FORMATTER_PLOT_INSTRUCTIONS = """
## Plot placeholders
Keep every `[PLOT:plot_id]` reference exactly as written inside a <div class="section"> block.
The surrounding container needs min-height: 500px (add it as a style attribute on that div only)."""


async def formatter_node(state: TrainingAnalysisState) -> dict[str, list | str]:
    logger.info("Starting HTML formatter node")

    try:
        plotting_enabled = state.get("plotting_enabled", False)

        agent_start_time = datetime.now()

        async def call_html_formatting():
            synthesis_result = extract_text_content(state.get("synthesis_result", ""))
            user_prompt = FORMATTER_USER_PROMPT.format(synthesis_result=synthesis_result)
            if plotting_enabled:
                user_prompt += FORMATTER_PLOT_INSTRUCTIONS

            response = await ModelSelector.get_llm(AgentRole.ANALYSIS_FORMATTER).ainvoke([
                {"role": "system", "content": FORMATTER_SYSTEM_PROMPT + get_language_instructions(state.get("language"))},
                {"role": "user", "content": user_prompt},
            ])
            return extract_text_content(response)

        raw_content = await retry_with_backoff(
            call_html_formatting, AI_ANALYSIS_CONFIG, "HTML Formatting"
        )

        inner_html = _extract_inner_html(strip_code_fences(raw_content))

        now = datetime.now()
        head, foot = analysis_shell(
            title=f"Training Analysis — {state.get('athlete_name', 'Athlete')} — {now.strftime('%Y-%m-%d')}",
            athlete=state.get("athlete_name", "Athlete"),
            date=now.strftime("%B %d, %Y"),
        )
        analysis_html = head + "\n" + inner_html + "\n" + foot

        execution_time = (datetime.now() - agent_start_time).total_seconds()
        logger.info("HTML formatting completed in %.2fs", execution_time)

        return {
            "analysis_html": analysis_html,
            "timings": [
                {
                    "agent": "formatter",
                    "execution_time": execution_time,
                    "timestamp": datetime.now().isoformat(),
                }
            ],
        }

    except Exception as exc:
        logger.exception("Formatter node failed")
        return {"errors": [f"HTML formatting failed: {exc!s}"]}


def _extract_inner_html(html: str) -> str:
    """If the model returned a full document despite instructions, extract just the body content."""
    lower = html.lower()
    # Preferred: extract between <main ...> and </main>
    if "<main" in lower and "</main>" in lower:
        start = lower.find("<main")
        end = lower.find("</main>") + len("</main>")
        block = html[start:end]
        return block[block.find(">") + 1 : block.rfind("</main>")]
    # Fallback: extract between <body ...> and </body>
    if "<body" in lower and "</body>" in lower:
        start = lower.find("<body")
        end = lower.find("</body>")
        block = html[start:end]
        return block[block.find(">") + 1:]
    # Already inner content — return as-is
    return html
