"""Fixed HTML design system for all formatter nodes.

Both analysis.html and planning.html use a shared HTML skeleton. The AI fills in
content using predefined CSS class names from globals.css — it never writes CSS.
All styling is owned by the Next.js app (web/app/globals.css).
"""


# ---------------------------------------------------------------------------
# Skeleton builders — provide the fixed outer HTML shell
# ---------------------------------------------------------------------------

def analysis_shell(title: str, athlete: str, date: str) -> tuple[str, str]:
    """Return (head_open, foot) strings that wrap the AI-generated <main> content."""
    head = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    <h1>Training Analysis — {athlete}</h1>
    <div class="header-meta"><span>{date}</span></div>
  </div>
</header>
<main class="page">"""
    foot = """</main>
</body>
</html>"""
    return head, foot


def planning_shell(title: str, athlete: str, date: str) -> tuple[str, str]:
    """Return (head_open, foot) strings that wrap the AI-generated <main> content."""
    head = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    <h1>Training Plan — {athlete}</h1>
    <div class="header-meta"><span>{date}</span></div>
  </div>
</header>
<main class="page">"""
    foot = """</main>
</body>
</html>"""
    return head, foot


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

def strip_code_fences(text: str) -> str:
    """Remove markdown code fences that models sometimes wrap HTML output in."""
    stripped = text.strip()
    for prefix in ("```html", "```"):
        if stripped.startswith(prefix):
            stripped = stripped[len(prefix):]
            break
    if stripped.endswith("```"):
        stripped = stripped[:-3]
    return stripped.strip()


# ---------------------------------------------------------------------------
# CSS class reference (injected into prompts so the AI knows what to use)
# ---------------------------------------------------------------------------

CSS_CLASS_REFERENCE = """\
Available CSS classes (use ONLY these — no inline styles, no <style> blocks):

LAYOUT:     .page  .section  .section-title
CARDS:      .card  .card-title  .card-grid  .card-accent  .card-cyan
KPI:        .kpi-grid  .kpi  .kpi-label  .kpi-value  .kpi-unit  .kpi-note
BADGES:     .badge  .badge-green  .badge-amber  .badge-red  .badge-blue  .badge-accent  .badge-cyan
TABLES:     <table> <th> <td>  (styled globally)
WEEK GRID:  .week-block  .week-label  .week-grid  .day-cell  .day-cell.key-session
            .day-cell.rest-day  .day-name  .day-date  .day-focus  .day-workout
            .day-adaptation  .day-check
CHECKLIST:  .checklist  (use <ul class="checklist"><li>...</li></ul>)
PROSE:      .prose  (wraps free-form paragraph HTML)
ALERTS:     .alert  .alert-info  .alert-warn  .alert-good  .alert-bad
PROGRESS:   .progress-bar  .progress-fill
COLOR VARS: var(--text) var(--muted) var(--dim) var(--accent) var(--cyan)
            var(--green) var(--amber) var(--red) var(--blue)

SPACING RULE: vertical spacing between blocks is handled automatically by the design
system. To ensure it works, keep block elements (.kpi-grid, .card-grid, .card, .alert,
.week-grid, .prose, <h3>, <p>) as DIRECT children of their parent container — do NOT
wrap them in extra <div> wrappers. The CSS uses adjacent-sibling selectors that only
fire when siblings are at the same level.\
"""
