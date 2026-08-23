# Design language

Derived from Adrian's reactions to 6 fintech/dashboard inspiration screenshots
("Loud", "H-care", "Tripper", "Metploy", a mobile-analytics set, and a retail-ops
dashboard) plus explicit design decisions made during the redesign. This is the
source of truth for *why* the current visual choices exist — read this before
changing tokens, layout patterns, or adding new dashboard components.

## Palette

Locked-in, revisable-if-needed (Adrian: "I'm sure we can move back on this later
if we find something better, so go ahead for right now").

| Role | Name | Hex |
|---|---|---|
| Ink / dark-mode bg / sidebar chrome | ink-black | `#001219` |
| Informational / bike-session identity | dark-teal | `#005f73` |
| Primary accent — vivid, text-safe | dark-cyan | `#0a9396` |
| Secondary tint — background/border only, **not** text (fails contrast on white) | pearl-aqua | `#94d2bd` |
| Raw palette, direct-use only | vanilla-custard | `#e9d8a6` |
| Warning / background-fill amber | golden-orange | `#ee9b00` |
| Amber — text/border-safe darker variant | burnt-caramel | `#ca6702` |
| Danger — text-safe | rusty-spice | `#bb3e03` |
| Danger — text-safe, primary "red" | oxidized-iron | `#ae2012` |
| Severe danger | brown-red | `#9b2226` |

**Real green and red are kept** for good/bad and up/down trend semantics
(readiness, surplus/deficit, PR hit) — explicit call from Adrian, overriding a
strict-palette-only approach: "Using green and red for up and down or good and
bad trends and similar is fine." These are *not* remapped onto the cool palette.

**Sidebar/mobile-header chrome is permanently ink-black**, independent of the
light/dark theme toggle — this was a deliberate simplification (see `--sb-*`
tokens in `globals.css`), not an oversight, and it directly matches the "Loud"
and "Metploy" references (dark nav rail, light content area).

## Typography

Three roles, via `next/font/google`:
- **Body/UI** — Geist Sans (`--font-sans`). Unchanged, zero risk, everywhere
  that isn't a hero moment.
- **Data/mono** — Geist Mono (`--font-mono`). Unchanged.
- **Display/hero** — **Bricolage Grotesque** (`--font-display`), added during
  the design-review pass because Geist alone for *everything* was flagged as
  reading like a generic default (the `frontend-design` skill calls this out
  explicitly). Applied via inline `fontFamily: "var(--font-display)"` to: the
  dashboard greeting, the hero session headline ("Tempo Run"), the
  `FitnessTrendChart` big number, and the `.sb-brand-name` sidebar wordmark.
  Chosen over Fraunces (a warm serif) specifically to stay in the sans-serif
  family — lower risk, no register clash with the rest of the UI, still gives
  hero text distinct, slightly quirky letterforms instead of defaulting to the
  same grotesque as the body copy. Not yet rolled out to every `.kpi-value` on
  every page — that's a larger blast radius, left for the page-by-page pass.

## What was explicitly liked, per image

1. **"Loud"** (dark purple fintech dashboard): smooth line charts with a
   gradient fade under the line (→ `FitnessTrendChart`'s hero chart). Time-of-day
   greeting ("Welcome back, Angela" → "Good morning/afternoon/evening/night,
   {name}"). GitHub-contribution-style "activity by time" heatmap (→
   `ActivityHeatmap`). "Recent transactions" list, explicitly renamed by Adrian
   to "Recent Sessions" (→ `RecentSessionsList`).
2. **"H-care"** (light medical dashboard): column/bar comparisons for
   structured data (superseded by image 6's stacked-bar preference for
   macros). Left sidebar. Explicit complaint: **the non-sidebar area felt too
   spaced out** — don't over-pad, keep it dense like the reference.
3. **"Tripper"** (light travel dashboard): "stock-like" KPI deltas — colored
   arrow + value, green/red (→ `DeltaBadge`). Circular, clickable calendar day
   markers that expand on click (already existed pre-redesign via
   `PlanCalendar`/`SessionDetailModal` — just needed a restyle, and inspired
   the day-number circles in `WeekAtGlanceStrip`). **One large, dominant
   graphic** (the map) so the page doesn't read as a uniform grid of
   equally-sized boxes — this is *the* structural principle behind giving
   `FitnessTrendChart` a full-width, stretch-to-match-row treatment rather than
   another KPI-sized tile.
4. **"Metploy"** (dark HR dashboard): same smooth gradient-fade chart language
   as "Loud". Sidebar with the active item lightly highlighted. **Settings
   pinned at the bottom of the sidebar** (→ the `.sb-bottom` slot).
5. Mobile screenshots — explicitly lower priority ("if you can make better
   based on the desktop view, you may ignore this").
6. **Retail ops dashboard**: **stacked** columns preferred over grouped/paired
   columns (H-care's style) for compositional data — this is the reference for
   the still-unbuilt `StackedMacroBar` (protein/carbs/fat).

## Layout principles (from the "empty space" correction round)

- **Real bento grids, not a stack of full-width sections.** Every dashboard row
  should pair a large element with a smaller side panel where the content
  supports it (chart + stats, heatmap + list) — not five full-width blocks one
  after another. This was a direct, sharp correction: "why is everything
  aligned from left to right entirely, and nothing fits multiple boxes
  horizontally."
- **Match card heights within a row.** Don't let one card in a 2-column row
  tower over its sibling and leave dead space under the shorter one. Prefer, in
  order: (1) cap unbounded lists to a fixed count that roughly matches the
  sibling's natural height (this is how the inspiration dashboards do it — a
  "recent" list always shows a fixed ~5 items, never "everything"), (2) let
  CSS Grid's default `stretch` equalize card heights and make the shorter
  card's content genuinely fill that space (flex + anchor secondary content
  like a legend to the bottom) rather than leaving a void.
- **Consistent card padding.** Every `.card`-based dashboard component uses the
  same padding (the default from the `.card` class) — no per-component 16/20/24
  overrides. Jagged left edges down the page are a real, checkable bug, not a
  style nitpick — verify with `getBoundingClientRect()` on card titles, don't
  eyeball it.
- **Remove sections that don't earn their place.** Don't carry forward
  low-value sections just because they existed before the redesign (Personal
  Records was cut for exactly this reason).

## Self-critique notes (frontend-design skill lens)

Applying the `frontend-design` skill's principle that "a big number with a
small label, supporting stats, and a gradient accent is the template answer" —
`FitnessTrendChart` *is* that template shape. That's acceptable here because
the brief itself asked for it explicitly (Adrian pointed at this exact pattern
in two separate reference images), and the skill's own guidance is that the
brief's explicit direction wins over avoiding a "default." But it means the
chart shouldn't also be treated as *the* signature/distinctive element — if
this dashboard has one, it's more likely `ActivityHeatmap`'s type-colored
(strength/run/other) contribution grid, since that's a data encoding specific
to this athlete's actual training categories, not a generic chart shape.

## Recurring bug: `.card + .card` margin leaking into bento grid rows

`globals.css` has a global rule, `.card + .card { margin-top: 16px; }`
(intended for vertically-**stacked** cards in a plain document flow). It's a
pure DOM-adjacency selector, so it also fires when two `.card` elements are
adjacent siblings **inside a CSS Grid row** — i.e. side-by-side columns, not
stacked — pushing the second (right-hand) column's card down by 16px and
breaking the row's top alignment even though `display: grid` items should
otherwise start at the same row-top by construction.

This had already been patched once for `.card-grid` (`.card-grid .card {
margin-top: 0; ... }`) and `.goal-grid` (`.goal-grid .card + .card {
margin-top: 0; }`), but the dashboard's `.dashboard-hero-grid` /
`.dashboard-activity-grid` classes were added later without carrying the same
override forward — so it silently affected every dashboard bento row where
**both** columns render a bare `.card` as their root element (confirmed via
`getBoundingClientRect()`, not just visual inspection — the left column's
card had `margin-top: 0`, the right column's had `margin-top: 16px`,
identical `top` otherwise). Fixed by adding `.dashboard-activity-grid > .card,
.dashboard-hero-grid > .card { margin-top: 0; }` next to the grid definition.

**Any new bento-row grid class should get the same override up front** if its
columns might both render a top-level `.card` — don't wait for it to surface
as a visual bug again.


## Recurring gotchas (hard-won, keep these)

Distilled from the full iteration log in `DESIGN-HISTORY.md` — these bit more than
once, so they're kept here rather than buried in the history file.

- **`.toISOString().slice(0,10)` on a *constructed* local date is wrong.** Appending
  `"T00:00:00"` to a date-only string switches JS from the UTC-midnight parse rule to
  the local-midnight rule; converting back via `.toISOString()` then lands on the
  previous calendar day in any timezone ahead of UTC (this machine, CEST, hits it every
  time). Read local parts (`getFullYear()`/`getMonth()`/`getDate()`) instead — the
  pattern `buildMonthCells()` in `lib/calendar.ts` already uses. `.toISOString()` is
  only safe when the `Date` genuinely represents a UTC instant (e.g. `new Date()`).
- **Python side, same class of bug:** `datetime.now().isoformat()` (naive, local) is
  read as already-UTC by Postgres, skewing stored timestamps by the local offset.
  Always `datetime.now(timezone.utc).isoformat()` for anything written to a timestamptz.
- **`globals.css` edits often don't reach the browser.** Fast Refresh frequently serves
  the old rule, and Turbopack *also* persists a disk cache in `web/.next/` across process
  restarts. If `getComputedStyle()` (or the served CSS bundle) doesn't match the source
  after a restart, `rm -rf web/.next` and restart — don't keep editing the file. Verify
  CSS changes against the actually-served bundle, not by assuming.
- **CSS `gap` is a pointer-events dead zone.** Any time hover/click state is split across
  sibling elements laid out with a grid/flex `gap`, moving the cursor through the gap
  fires `onMouseLeave` before the next element's `onMouseEnter`. Make the interactive
  element span the full cell and push the visual spacing into a child.
- **Stretch vs. natural height:** use grid `stretch` only when the stretched element can
  do something useful with the extra space (taller bars, more chart detail). When it
  can't, `align-items: start` and a real, varying gap beats fake constant padding.

## Where the rest went

Everything else — the per-component iteration log (`FitnessTrendChart`, `WeeklyMacrosCard`
v2–v5, hero row v2/v3, Plan page v3/v4, the redesign completion pass, etc.), including
rejected approaches and *why* they were rejected — lives in **`DESIGN-HISTORY.md`**.
That file is deliberately **not** auto-imported into context; read it when you need the
reasoning behind a specific past decision, or before re-litigating one.
