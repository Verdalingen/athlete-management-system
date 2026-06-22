"""
Fixed HTML design system for all formatter nodes.

Both analysis.html and planning.html use the same CSS token set and HTML skeleton
so every run produces a visually consistent document. The AI fills in content
using predefined CSS class names — it never writes CSS.
"""

# ---------------------------------------------------------------------------
# Shared CSS — injected verbatim into every generated page
# ---------------------------------------------------------------------------

DESIGN_CSS = """\
<style>
/* === GARMIN AI COACH — DESIGN SYSTEM v1 === */
:root {
  --bg:        #080e1a;
  --surface:   #111a33;
  --surface2:  #162040;
  --border:    rgba(255,255,255,.10);
  --text:      #e8eeff;
  --muted:     #8fa4cc;
  --dim:       #5a6f96;

  --accent:    #7c5cff;
  --cyan:      #2de2e6;
  --green:     #38d996;
  --amber:     #ffcc66;
  --red:       #ff5c7a;
  --blue:      #6fb6ff;

  --radius:    14px;
  --radius-sm: 8px;
  --shadow:    0 8px 32px rgba(0,0,0,.40);
  --font:      ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --mono:      ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { height: 100%; }
body {
  font-family: var(--font);
  background-color: var(--bg);
  background-image:
    radial-gradient(1100px 600px at 15% 0%, rgba(124,92,255,.22) 0%, transparent 55%),
    radial-gradient(900px 500px at 90% 5%, rgba(45,226,230,.15) 0%, transparent 50%);
  background-attachment: fixed;
  color: var(--text);
  line-height: 1.55;
  min-height: 100%;
}
a { color: var(--cyan); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre { font-family: var(--mono); }

/* === LAYOUT === */
.page { max-width: 1100px; margin: 0 auto; padding: 0 20px 60px; }

/* === STICKY HEADER === */
.site-header {
  position: sticky; top: 0; z-index: 10;
  backdrop-filter: blur(12px);
  background: rgba(8,14,26,.88);
  border-bottom: 1px solid var(--border);
}
.site-header-inner {
  max-width: 1100px; margin: 0 auto;
  padding: 12px 20px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-wrap: wrap;
}
.site-header h1 { font-size: 15px; font-weight: 700; letter-spacing: .3px; }
.header-meta { font-size: 12px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }

/* === SECTIONS === */
.section { margin-top: 28px; }
.section-title {
  font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase;
  color: var(--dim); margin-bottom: 12px;
  padding-bottom: 8px; border-bottom: 1px solid var(--border);
}

/* === CARDS === */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px;
  box-shadow: var(--shadow);
}
.card + .card { margin-top: 12px; }
.card-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: stretch; }
.card-grid .card { margin-top: 0; height: 100%; }
@media (max-width: 640px) { .card-grid { grid-template-columns: 1fr; } }

/* === KPI STRIP === */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  align-items: stretch;
}
.kpi {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 14px 16px;
  display: flex; flex-direction: column;
}
.kpi-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; letter-spacing: .3px; }
.kpi-value { font-size: 22px; font-weight: 800; line-height: 1.1; }
.kpi-unit  { font-size: 12px; color: var(--muted); margin-left: 2px; font-weight: 400; }
.kpi-note  { font-size: 11px; color: var(--muted); margin-top: 4px; }

/* === STATUS BADGES === */
.badge {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .4px;
  padding: 2px 8px; border-radius: 99px;
}
.badge-green  { background: rgba(56,217,150,.15);  color: var(--green);  border: 1px solid rgba(56,217,150,.25); }
.badge-amber  { background: rgba(255,204,102,.15); color: var(--amber);  border: 1px solid rgba(255,204,102,.25); }
.badge-red    { background: rgba(255,92,122,.15);  color: var(--red);    border: 1px solid rgba(255,92,122,.25); }
.badge-blue   { background: rgba(111,182,255,.15); color: var(--blue);   border: 1px solid rgba(111,182,255,.25); }
.badge-accent { background: rgba(124,92,255,.15);  color: var(--accent); border: 1px solid rgba(124,92,255,.25); }

/* === TABLES === */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .8px;
  text-transform: uppercase; color: var(--dim);
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
td { padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,.05); vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,.025); }

/* === WEEK GRID (planning only) === */
.week-block { margin-top: 20px; }
.week-label {
  font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;
  color: var(--accent); margin-bottom: 8px;
}
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
@media (max-width: 760px) { .week-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .week-grid { grid-template-columns: 1fr; } }
.day-cell {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 10px 8px; min-height: 100px;
}
.day-cell.key-session { border-color: rgba(124,92,255,.45); background: rgba(124,92,255,.07); }
.day-cell.rest-day { opacity: .55; }
.day-name { font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--dim); }
.day-date { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
.day-focus { font-size: 11px; font-weight: 700; color: var(--cyan); margin-bottom: 3px; }
.day-workout { font-size: 11px; color: var(--text); line-height: 1.4; }
.day-adaptation { font-size: 10px; color: var(--muted); margin-top: 5px; font-style: italic; }
.day-check { margin-top: 8px; }
.day-check label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); cursor: pointer; }
.day-check input[type=checkbox] { accent-color: var(--accent); width: 13px; height: 13px; flex-shrink: 0; }

/* === CHECKLIST === */
.checklist { list-style: none; }
.checklist li {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.04);
}
.checklist li:last-child { border-bottom: none; }
.checklist input[type=checkbox] { accent-color: var(--accent); flex-shrink: 0; margin-top: 3px; cursor: pointer; }

/* === PROSE === */
.prose { font-size: 14px; }
.prose p { margin-bottom: 10px; }
.prose ul, .prose ol { margin: 8px 0 8px 20px; }
.prose li { margin-bottom: 4px; }
.prose strong { font-weight: 700; }
.prose em { color: var(--muted); }
.prose h2 { font-size: 16px; font-weight: 700; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.prose h3 { font-size: 14px; font-weight: 700; margin: 14px 0 6px; color: var(--cyan); }
.prose h4 { font-size: 13px; font-weight: 700; margin: 12px 0 5px; color: var(--muted); }
.prose code { background: rgba(255,255,255,.06); padding: 1px 5px; border-radius: 4px; font-size: 12px; }

/* === ALERTS === */
.alert { border-radius: var(--radius-sm); padding: 12px 16px; font-size: 13px; margin-bottom: 10px; }
.alert-info  { background: rgba(111,182,255,.10); border-left: 3px solid var(--blue); }
.alert-warn  { background: rgba(255,204,102,.10); border-left: 3px solid var(--amber); }
.alert-good  { background: rgba(56,217,150,.10);  border-left: 3px solid var(--green); }
.alert-bad   { background: rgba(255,92,122,.10);  border-left: 3px solid var(--red); }

/* === PROGRESS BAR === */
.progress-bar { height: 5px; background: rgba(255,255,255,.08); border-radius: 3px; overflow: hidden; margin-top: 6px; }
.progress-fill { height: 100%; border-radius: 3px; background: var(--accent); }

/* === SECTION ELEMENT SPACING === */
/* Add breathing room whenever these elements follow a sibling within a section */
* + .kpi-grid  { margin-top: 16px; }
* + .card-grid { margin-top: 16px; }
* + .card      { margin-top: 12px; }
* + .alert     { margin-top: 10px; }
* + .progress-bar { margin-top: 8px; }

/* === HEADINGS OUTSIDE .prose === */
h3 {
  font-size: 13px; font-weight: 700; color: var(--cyan);
  letter-spacing: .3px; margin-bottom: 8px;
}
h4 {
  font-size: 12px; font-weight: 700; color: var(--muted);
  letter-spacing: .3px; margin-bottom: 6px;
}
* + h3 { margin-top: 20px; }
* + h4 { margin-top: 16px; }
</style>"""


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
  {DESIGN_CSS}
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
  {DESIGN_CSS}
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
    # Remove opening ```html or ``` fence
    for prefix in ("```html", "```"):
        if stripped.startswith(prefix):
            stripped = stripped[len(prefix):]
            break
    # Remove closing ``` fence
    if stripped.endswith("```"):
        stripped = stripped[: -3]
    return stripped.strip()


# ---------------------------------------------------------------------------
# CSS class reference (injected into prompts so the AI knows what to use)
# ---------------------------------------------------------------------------

CSS_CLASS_REFERENCE = """\
Available CSS classes (use ONLY these — no inline styles, no new <style> blocks):

LAYOUT:     .page  .section  .section-title
CARDS:      .card  .card-title  .card-grid
KPI:        .kpi-grid  .kpi  .kpi-label  .kpi-value  .kpi-unit  .kpi-note
BADGES:     .badge  .badge-green  .badge-amber  .badge-red  .badge-blue  .badge-accent
TABLES:     <table> <th> <td>  (styled globally)
WEEK GRID:  .week-block  .week-label  .week-grid  .day-cell  .day-cell.key-session
            .day-cell.rest-day  .day-name  .day-date  .day-focus  .day-workout
            .day-adaptation  .day-check
CHECKLIST:  .checklist  (use <ul class="checklist"><li>...</li></ul>)
PROSE:      .prose  (wraps free-form markdown-derived HTML)
ALERTS:     .alert  .alert-info  .alert-warn  .alert-good  .alert-bad
PROGRESS:   .progress-bar  .progress-fill
COLOR VARS: var(--text) var(--muted) var(--dim) var(--accent) var(--cyan)
            var(--green) var(--amber) var(--red) var(--blue)\
"""
