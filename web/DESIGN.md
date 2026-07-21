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

## `DeltaBadge` — actually a pill now

Originally shipped as plain colored text (▲/▼ + number, no background) with a
`tone: "good-bad" | "neutral"` prop to avoid editorializing ambiguous metrics
(CTL/ATL direction, weight change without knowing goal direction). Adrian
pointed back at the Tripper reference image — the literal source of the
"stock-like KPI delta" idea from the original inspiration round — and asked
for the real pill treatment: rounded tinted background, trending icon, bold
colored value inside.

Also dropped `tone` entirely. The Tripper reference colors purely by
direction (its "Cancelled Trip +2.03%" pill is green despite an *increase* in
cancellations being bad news) — it doesn't editorialize, it's mechanical:
up = green, down = red. Matching that exactly resolved the ambiguity that
`tone="neutral"` existed to route around, so the extra concept just added
complexity without a payoff. `positiveIsGood` stays as an override for a
future caller that genuinely needs inverted semantics, but every current
usage (`FitnessTrendChart`'s CTL delta, Ramp Rate, Weight Δ) uses the default.

## `FitnessTrendChart` — CTL + ATL, fixed 3-month window

Originally shipped as a single CTL line. Adrian pointed at the Progress page's
"Performance Management" chart (CTL solid + ATL dashed, un-faded) and asked
for both metrics on the dashboard hero, faded, and **smoother than the
dashboard's existing line** — a direct comparison, not just "add a metric".

- **Smoothing upgraded**: the original `smoothPath()` was a quadratic-through-
  midpoints approximation (cheap, doesn't pass exactly through data points).
  Replaced with a Catmull-Rom-to-cubic-Bezier spline (tension 1/6, the
  standard default) — passes exactly through every point with continuous
  tangents, genuinely smoother rather than just "corners knocked off". If
  another chart on this app ever needs smoothing, reuse this version, not the
  old one.
- **Two gradient fills, not one** — CTL (`--accent`) and ATL (`--red`), both
  low-opacity (`.26`/`.20`) so their overlap (common, since ATL frequently
  spikes above CTL) blends into a deeper shade instead of going muddy/opaque.
  ATL keeps a dashed stroke on top of its solid fill — matches the Progress
  page's CTL-solid/ATL-dashed convention, and gives a second differentiator
  (color + dash) beyond color alone.
- **Fixed 90-day window, no timeframe toggle** — "the last 3 months" was
  explicit. The toggle (1M/3M/6M/1Y) stays a Progress-page-only feature; this
  hero stays glanceable, not a tool.
- Card title changed from "Fitness (CTL)" to "Fitness & Fatigue" to reflect
  the second series; the big headline number + delta badge stay CTL-only
  (still the primary "how's my fitness trending" glance stat), with a small
  CTL/ATL legend added top-right matching the Progress page's legend style.
- **ATL is a solid line, not dashed** — Adrian's call, overriding the Progress
  page's solid-CTL/dashed-ATL convention specifically for this chart. Color
  alone (`--accent` vs `--red`) differentiates the two here.
- **Tried pre-averaging the data (5-day moving average before the spline),
  reverted** — Adrian preferred the exact-data version and asked for less
  "shakiness" through a different lever instead. Landed on: keep raw CTL/ATL
  values (hover and the headline number always show the real number for that
  date, never an averaged one), but detune the Catmull-Rom tension from the
  textbook 1/6 default down to 1/12 (see `TENSION` in `smoothPath()`). A
  smaller tangent magnitude means the curve doesn't swing/overshoot as far
  past the direct point-to-point path on a sharp reversal — that overshoot,
  not the data itself, was most of what read as "shaky". If a future ask
  wants the line even calmer, turn `TENSION` up further before reaching for
  data-averaging again — that lever visibly changes the reported values,
  which is the thing this reversal specifically avoided.
- **Gotcha for any future `preserveAspectRatio="none"` chart in this app**:
  non-uniform SVG scaling (used so the chart fills a CSS-Grid-stretched card
  height without letterboxing) distorts anything that isn't a path — circles
  become ellipses, `<text>` glyphs warp, and any fixed-width tooltip box
  computed in viewBox units stops matching the actual rendered text width
  (this is what caused the "hover text is cropped" bug). Fix: keep only
  path-based elements (area fills, line strokes, the crosshair line) inside
  the distorted `<svg>`; render hover dots, axis labels, and the tooltip as an
  absolutely-positioned HTML overlay sibling, using the same `x/W`, `y/H`
  fraction math for position. See `FitnessTrendChart.tsx` for the pattern —
  reuse it rather than re-deriving if `ProgressTabs.tsx` or another chart ever
  needs this same "fill the stretched card height" treatment.

## Calendar split: `MiniMonthCalendar` (dashboard) vs. `ActivityHeatmap` (Progress)

Adrian pointed at a Tripper-style month-grid reference (M–T–W–T–F–S–S header,
plain grey circles for days, a filled circle for today) and asked for two
separate changes: replace the dashboard's "Training Consistency" heatmap with
that minimal circular calendar, and move the heatmap itself to the Progress
page instead of deleting it.

- **`MiniMonthCalendar.tsx`** (dashboard, `web/app/(app)/`) — single-month
  view, prev/next chevron nav, circular day numbers (accent-filled for today,
  tinted for a day with a session), a small colored dot per day for session
  type, click-to-expand into the existing `SessionDetailModal`. This is now
  the dashboard's calendar/activity anchor, replacing the old heatmap.
- **`ActivityHeatmap.tsx`** (moved to `report/ProgressTabs.tsx`'s Trends tab,
  right after `PMCChart`) — reworked from a continuous GitHub-style week-strip
  into proper calendar-month blocks (reusing the same `buildMonthCells` grid
  logic as `MiniMonthCalendar`/`PlanCalendar`), grouped by month, shaded by
  training load, colored by dominant session type. Shows the current + previous
  month by default with a "Show more/Show less" toggle revealing up to a year
  back — this is the "divided by month... should be able to expand this" part
  of the request. `report/page.tsx` fetches `completed_activities` for a
  365-day window and passes it down as a new `completedActivities` prop on
  `ProgressTabs`.
- Shared month-grid logic (`CalDay`, `MONTH_NAMES`, `DAY_HEADERS`,
  `buildMonthCells`, `monthsInRange`) was extracted to `web/lib/calendar.ts`
  during this change so `PlanCalendar`, `MiniMonthCalendar`, and
  `ActivityHeatmap` all build their grids identically instead of three
  slightly-diverging local copies.

## Dashboard restructure: greeting/session + calendar as the top row

A closer look at the Tripper reference showed its real structural trick isn't
just the calendar's circle-day styling (already adopted) — it's that **every
label lives inside a card as that card's own title** (`Done Trip`, `My
Travels`, `Upcoming Bookings`). There are no full-width page-level headers
floating between boxes. Adrian called this out directly: "I don't like the
headers inbetween the bento boxes."

- **Row 1** is now `greeting + readiness pills + today's session` (left,
  unboxed except for the session card itself) against `MiniMonthCalendar`
  (right), in `.dashboard-hero-grid` (1.4fr/1fr). This mirrors Tripper's
  KPI-cards/calendar pairing: the left content's natural height sets the row
  height, and the calendar stretches to match via CSS Grid's default
  `align-items: stretch` — bottoms align for free, no manual height math.
  `MiniMonthCalendar` centers its content vertically (`justifyContent:
  "center"` on the card's root) so the extra stretched height reads as
  balanced padding, not a dead gap at the bottom.
- The greeting moved from a small 20px inline label above everything to a
  28px `<h1>` in the display font, with the readiness pills now living
  directly under it (`gap: 16` flex column) instead of floating above the
  greeting — matches "large 'Good morning, Adrian' ... with the battery KPIs
  under it."
- **Row 2** is `FitnessTrendChart + RecentSessionsList` (`.dashboard-activity-
  grid`, same 1.4fr/1fr ratio) — the chart keeps its "one dominant graphic"
  role, now paired with the transactions-style list instead of the "This
  Week" stat panel.
- **"This Week"** (season week, next check-in, session count, next key +
  `WeekAtGlanceStrip`) lost its bento partner when the chart moved to Row 2,
  and became its own full-width card instead of being force-paired with
  something unrelated — its stat grid changed from a cramped `1fr 1fr` to
  `repeat(auto-fit, minmax(140px, 1fr))` now that it has the whole row to
  work with, and `WeekAtGlanceStrip`'s 7-day strip benefits from the extra
  width too.
- **`section-title` headers removed from Goals and Metrics** — both already
  had per-card titles (`Bench Press`, `Race Predictions`, each `KpiGroup`'s
  own label), so the outer `<h2 className="section-title">` was pure
  redundant chrome, exactly what Adrian was reacting to. `Metrics` keeps its
  small right-aligned "as of {date}" freshness note (real information) but
  drops the bold label above it.
- Not yet resolved: whether `DashboardActions` (check-in overdue / season
  ended banner) and the `Goals` grid could also gain a bento partner rather
  than staying full-width. Left alone for now since neither has an obvious
  same-row companion — flagged here rather than forced into a pairing that
  doesn't earn its place (see the "remove sections that don't earn their
  place" principle above).

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

## `TodaySessionCard` — bounding the hero card's height

A large strength session (7 exercises: "Bench Variant + Legs") made the hero
session card tall enough that `MiniMonthCalendar`'s grid-stretch match left a
large dead gap under its legend — centering the calendar's content helped a
little but couldn't fix an unbounded left column. Two fixes, both from
Adrian's direct feedback:

- **Raw description text removed for strength sessions.** The dashboard hero
  card was rendering `WorkoutStructure(today_day.description)` unconditionally,
  which for a strength day is just a plain-text summary ("Close-grip bench
  3x8-12, DB Bulgarian split squat 2x5-8, ...") in a grey box — fully redundant
  once the actual exercise table renders right below it with the same
  information, structured. `SessionDetailModal` already had the right rule
  (`day.session_type !== "strength"` gates `WorkoutStructure`); the dashboard
  hero card just never picked it up. Now both agree.
- **Exercise table capped at 5 visible rows**, with a "+N more exercises ·
  View full session" row when there are more. Adrian explicitly preferred this
  over a scrollable table — clicking the row opens the *same*
  `SessionDetailModal` the calendar already uses (passing `calDayMap[today]`,
  which the dashboard was already computing for `MiniMonthCalendar`, so no new
  data fetching was needed), rather than inventing a second "full session"
  view. This bounds the hero card's height to a predictable range regardless
  of how many exercises a session has, which is what actually fixes the
  calendar-stretch gap — capping the *cause* rather than shrinking the
  calendar or trying to center-pad around an unbounded sibling.
- This pulled the hero-card markup out of `page.tsx` into a new client
  component, `TodaySessionCard.tsx`, since the expand/collapse needs
  `useState`. `page.tsx` stays a server component; only the interactive leaf
  moved.

Capping the exercise table narrowed the height gap a lot but didn't fully
close it — with the calendar's own natural height fixed and the session
card's still varying (rest days, short sessions, 5-vs-7-exercise days), any
remaining gap still forced grid-stretch to pad `MiniMonthCalendar` with dead
space top and bottom, even after the earlier `justifyContent: "center"` fix.
Adrian confirmed he still saw whitespace, so `.dashboard-hero-grid` was
switched from the default `align-items: stretch` to `align-items: start` —
the calendar now renders at its own intrinsic height instead of matching the
row, and the `justifyContent: "center"` / `height: "100%"` centering hack on
`MiniMonthCalendar`'s root was removed as no longer needed. **This is
deliberately different from `.dashboard-activity-grid`** (chart + recent-
sessions list), which keeps `stretch` — those two have comparable natural
heights, so matching them is the right call, while the hero row's two
columns are structurally mismatched (a variable-length session card vs. a
fixed-size calendar) and trying to force them to the same height was the
wrong lever from the start, regardless of how well the varying column's
height is bounded.

## Hero row v2 — This Week folded in, 3-column attempt rejected

Adrian asked to fit "This Week" (previously its own full-width card below
the fold) into the same top section as the greeting/session/calendar, all
aligned top and bottom. Two shapes were tried:

- **Stacked 2-column** (session card | calendar + This Week stacked): closed
  most of the gap versus the old separate-full-width-section layout, but
  measured at a real ~210px mismatch (session card 549px vs. calendar+This
  Week 759px) — better than forced-stretch dead space, but not what "aligned"
  means.
- **3-column** (session | calendar | This Week side-by-side), tried next per
  Adrian's explicit "more than two parts beside each other" suggestion: this
  was *measured worse*, not better. At this page's ~1156px content width,
  giving the session card a narrower column (431px vs. its previous 665px)
  caused exercise names to wrap onto two lines ("Barbell Close-Grip Bench
  Press", "DB Bulgarian Split Squat"), which made the card *taller* (665px)
  instead of shorter — widening the gap to ~326px. Reverted once measured;
  the lesson is to verify a layout idea against actual `getBoundingClientRect()`
  numbers before treating "it should help" as "it did help," especially when
  a column's width also drives its height (wrapping text) as a second-order
  effect.
- **What actually landed**: back to stacked 2-column, plus dropping
  `WeekAtGlanceStrip` (the 4-day mini-strip) from the "This Week" card
  entirely — it was a condensed duplicate of what `/week` already shows in
  full, so cutting it wasn't a content loss, just de-duplication. This took
  the right column from 759px down to 629px against the session card's
  549px — a ~79px gap, down from ~210px. `WeekAtGlanceStrip.tsx` and its
  dead `.week-strip`/`.strip-*` CSS were deleted outright (grep-confirmed
  zero remaining usages) rather than left as unused code.
- **Residual ~79px gap is accepted, not hidden.** It varies day to day (rest
  days shrink the session card further; the calendar+This Week column stays
  roughly fixed), and `align-items: start` means it shows as a bit of visible
  page background under the shorter column rather than forced padding inside
  a card. That's the intended tradeoff from this whole redesign thread: real,
  varying gaps from mismatched natural content sizes are preferable to fake,
  constant padding manufactured by forcing two different things to the same
  height.

## Hero row v3 — `WeeklyMacrosCard`, This Week moved back under the session

Adrian preferred an earlier arrangement over the v2 stacked layout: This Week
back under the session card (left column), calendar alone in the upper right,
with a new macronutrient-breakdown widget filling the remaining right-column
space below the calendar — modeled on a mobile-analytics "Installs" card he
referenced (title, colored total badges, a 7-day stacked bar row).

- **Layout**: left column = greeting/pills/session/This Week, all stacked
  (This Week's own `.card` gets an explicit `marginTop: 0` since it's the
  second `.card` in a `gap: 16` flex column — otherwise `.card + .card`'s
  16px margin stacks with the flex gap for 32px instead of 16px). Right
  column = calendar + `WeeklyMacrosCard`, stacked (no flex/gap wrapper here,
  so the plain `.card + .card` 16px margin is exactly right, no override
  needed — this is the same "flex column vs. plain block stack" distinction
  worth checking any time two `.card`s end up adjacent).
- **`WeeklyMacrosCard.tsx`** (new) fulfills the long-pending `StackedMacroBar`
  item from the original redesign plan, repurposed as a dashboard widget
  instead of a `nutrition/` page component. Queries `nutrition_diary` for the
  current Mon–Sun week (`neq("meal_type","water")`, matching the exact
  aggregation pattern already used by `/api/nutrition/trends`), summed
  per-day in JS. Colors reuse `NutritionClient.tsx`'s existing tokens exactly
  (protein `--accent`, carbs `--cyan`, fat `--amber`) so the two pages agree.
- **Contrast fix on the way in, not after**: `NutritionClient.tsx` uses
  `--cyan` (pearl-aqua) as literal text color in several places, but
  DESIGN.md's own palette table marks pearl-aqua "background/border only,
  not text — fails contrast on white." Rather than copy that pre-existing
  inconsistency into a new component, `WeeklyMacrosCard`'s macro badges use
  a neutral `var(--dim)` label with a small colored dot for the color-coding
  (matching `FitnessTrendChart`'s legend: colored swatch + plain text) —
  the color still fully identifies each macro, just not through text that's
  actually hard to read. `NutritionClient.tsx`'s own instances of this were
  left alone (out of scope here, flagged for a future pass).
- Stacks in **grams**, not calories-from-macro — matches how the rest of the
  nutrition UI (`MacroBar`, `CalRing`) already presents macros, rather than
  introducing a second unit convention just for this one chart.
- `WeekAtGlanceStrip`'s deletion (previous section) stands — This Week's
  stat grid alone is what moved back, not the day-strip.

## `WeeklyMacrosCard` v2 — click-to-select a day

First cut showed fixed weekly totals in the badges — Adrian's actual ask was
per-day drill-down: click a day's bar, its calories show top-left and its
protein/carbs/fat show top-right (kcal + macros both re-render for whichever
day is selected, defaulting to today on load). Required converting the
component from a server-rendered stack to `"use client"` with a
`useState(today)` for `selectedDate`, since the interaction lives entirely
client-side (no new data fetching on click — all 7 days' data is already
present, selecting just re-reads a different array entry).

- **Bars now always render**, even with zero data — previously an
  `!hasWeekData` check replaced the whole chart area with static text,
  which also made the new click interaction untestable whenever a week had
  no logged meals (as this account's current week does, aside from one day).
  Empty days now show as hollow pill outlines (still clickable, still
  showing "0g"/"0 kcal" when selected) with a small "No meals logged yet
  this week" note kept below the chart rather than replacing it.
- **Real timezone bug found and fixed while verifying**: the 7-day array
  wasn't landing in the Mon–Sun order it was supposed to — it rendered
  Sun-first instead. Root cause: `new Date(weekStart + "T00:00:00")`
  appends a bare time-of-day to a date-only string, which switches how JS
  parses it from the "UTC midnight" rule (date-only strings) to the "local
  midnight" rule (datetime strings without a zone) — then `.toISOString()`
  converts that local midnight back to UTC, landing on the *previous*
  calendar day in any timezone ahead of UTC (this dev machine's local
  timezone, CEST/UTC+2, triggers it every time). `weekBounds()` in
  `lib/dates.ts` happens to dodge this same trap today only by coincidence
  (it parses a bare date string, taking the UTC-midnight branch, and CEST's
  +2h offset happens to round-trip cleanly) — it is not a template to copy.
  Fixed by reading the local date parts directly (`getFullYear()`/
  `getMonth()`/`getDate()`) instead of `.toISOString()`, the same pattern
  `buildMonthCells()` in `lib/calendar.ts` already uses for exactly this
  reason. **Any new code building a date string from a `Date` object should
  default to this local-parts pattern, not `.toISOString().slice(0,10)`** —
  the latter is only safe when the `Date` already represents a UTC instant
  (e.g. `new Date()` for "right now"), not a constructed local calendar date.
  This bug was only caught because bars were made clickable/visible even
  with sparse data — another point for verifying interactive changes against
  real rendered output rather than reasoning about the code in the abstract.

## `WeeklyMacrosCard` v3 — calorie-height bars, hover-to-reveal, fill to match

Closer look at the "Installs" reference showed the actual mechanic Adrian
wanted wasn't a fixed-height bar with a click-selected color — it's a
variable-height bar (tall = more that day) where only the active column
shows real color and every other column is a muted, textured "ghost" of
itself. Three changes:

- **Bar height now maps to that day's total calories** (`d.calories /
  weekMaxCalories`), not summed macro grams — grams still drive the internal
  segment split, but converted to their calorie contribution first
  (protein/carbs ×4, fat ×9) so a bar's internal proportions and its overall
  height both derive from the same calorie accounting, rather than mixing a
  gram-based split inside a calorie-based total.
- **Only the active day (hover, or the click-selected day when nothing's
  hovered) shows real macro colors** — every other bar renders as a single
  muted pill using a `repeating-linear-gradient` hatch texture
  (`var(--overlay-3)`/`var(--overlay-4)`) instead of the three colored
  segments, matching the reference's discolored/textured non-selected
  columns. This also simplified the component: muted bars don't need to
  compute or render 3 segments at all, just one textured fill at the
  calorie-proportional height.
- **Hover now drives the header live**, click persists the selection —
  `activeDate = hoveredDate ?? selectedDate`. This mirrors
  `FitnessTrendChart`'s existing `ctlDeltaAsOf(hoveredDate ?? latest)`
  pattern exactly (hover previews, falls back to a persisted "current" value
  when nothing's hovered) rather than inventing a second interaction model
  for the same dashboard.
- **Card now genuinely fills to match "This Week"'s bottom**, not just
  approximately — the right column wrapper became `display: flex;
  flex-direction: column`, `MiniMonthCalendar` keeps its natural height, and
  `WeeklyMacrosCard` gets `flex: 1` so it consumes exactly the leftover
  space, verified via `getBoundingClientRect()` showing identical `top` and
  `bottom` on both grid columns (773.5px each). This is a deliberate
  exception to the "don't force-stretch, natural content sizing beats fake
  padding" principle used everywhere else on this page — it's justified
  here because, unlike the earlier calendar-stretch case, the extra height
  now has a genuine use (taller, more differentiated bars) rather than
  becoming empty padding. Stretch is the right lever exactly when the
  stretched content can do something useful with the space; use `start`
  when it can't.

## `WeeklyMacrosCard` v4 — closer look at the reference's actual bar anatomy

A second, closer pass at the "Installs" reference showed three things the
first cut missed:

- **Columns are wide with a tight gap** between them, not evenly-spaced thin
  bars — `BAR_WIDTH` went 24→32px, the 7-column grid's `gap` went 6→4px.
- **Macro segments are separate rounded pieces with a visible gap between
  them**, not one pill split by touching colors. Each segment now gets its
  own `border-radius` and the stack uses `gap: 3` (flex `column-reverse`)
  instead of one `overflow: hidden` pill with flush-touching fills. Sizing
  moved from percentage-heights to `flex-grow` weighted by each macro's
  calorie share (`flex: ${proteinCal} 0 0`, etc.) — flexbox's `gap` already
  accounts for the reserved gap space automatically, which manual
  percentage math would've had to subtract by hand.
- **Muted (non-active) bars still show all 3 segments, gapped the same
  way** — the first cut collapsed muted bars to a single untextured pill,
  losing the division entirely. Now muted segments render individually:
  fat and carbs (the two upper pieces) get a flat `var(--overlay-3))` fill,
  protein (the base piece) gets the diagonal hatch — mirroring the
  reference's own "solid on top, hatched at the bottom" muted styling,
  translated from its 2-segment case to this card's 3.
- The active-day outline moved from wrapping each segment individually to
  a single capsule (`padding: 3` + `outline`) around the whole 3-segment
  group, so the highlight reads as "this whole day," not three separately
  outlined pieces.

## `WeeklyMacrosCard` v5 — real rectangles, wider bars, continuous hover

- **Segment corners**: Adrian didn't want the pill/capsule look — corner
  radius dropped from `BAR_WIDTH / 2` (fully rounded, reads as a capsule)
  to a fixed `CORNER_RADIUS = 7` (a genuine rounded rectangle regardless of
  bar width). `BAR_WIDTH` also went 32→40px.
- **Real hover dead-zone bug, not a one-off complaint**: the day columns
  sat in a CSS Grid with `gap`, and each day's hover trigger was its own
  `<button>` covering only its own cell — the strip of space the grid `gap`
  itself occupies belongs to neither button, so moving the cursor through
  it fired `onMouseLeave` (resetting `hoveredDate` to `null`, snapping the
  header back to "Today") a beat before the next button's `onMouseEnter`
  landed. Fixed by dropping the grid `gap` entirely (`gridTemplateColumns:
  repeat(7, 1fr)` with no `gap`) so each button spans its column edge-to-
  edge — the row becomes one continuous hover surface with zero dead
  space between cells. The *visual* gap between bars is unaffected: each
  bar is still only `BAR_WIDTH`px wide, centered inside its now-gapless,
  full-width button via the button's own `alignItems: "center"`, so the
  gap the eye sees is real column whitespace, not a real DOM/hover gap.
  Verified by hovering exactly at the old inter-column boundary and
  confirming the header stayed on the day whose button now extends there,
  instead of flickering back to today.
- **General pattern worth remembering**: any time hover/click state is
  split across several sibling elements laid out with a CSS `gap`
  (flex or grid), check whether the gap itself is a dead zone for pointer
  events before shipping — it very often is, and the fix is almost always
  "make the interactive element cover the full cell, push the visual
  spacing down into a child element instead of the gap."

## Dashboard Metrics section — curated glance grid + one "More metrics" toggle

The bottom-of-dashboard KPI section had grown to ~29 individual tiles across
six independently-collapsible `KpiGroup`s (Training Load, Readiness, Sleep,
Performance, Body, Stress), each using `repeat(auto-fill, minmax(150px,
1fr))` — different item counts per group meant differently-sized tiles
group to group, and two of the six defaulted open (Training Load,
Readiness) while four stayed collapsed, so the page read as uneven and
overwhelming rather than glanceable. Adrian asked for an actual analysis of
what's important, not just a visual tidy-up.

- **Real duplication found first**: `ReadinessStrip`'s pills (top of the
  dashboard) already show TSB, current Body Battery, 7-day HRV average, and
  total sleep hours — reading the exact same `kpis.*` fields the metrics
  grid was *also* displaying lower down. These four were cut outright
  (not just deprioritized) since re-showing identical numbers in a second
  location adds scrolling, not information. `tsbBadge()` and `sleepBadge()`
  became fully unused as a result and were deleted rather than left as dead
  code.
- **Curated 6-tile primary grid**, chosen for direct relevance to Adrian's
  actual goals/monitoring habits (see `user_athlete_profile` memory — bench
  1RM, sub-10 3k, recomp) rather than "whatever the API happens to return":
  ACWR (injury-risk, already showing "Danger" live — the single most
  actionable number here), Ramp Rate (load trend), Weight + VO₂max running
  (goal tracking), Resting HR and HRV-last-night (recovery signals the
  pills don't already cover — the pills use HRV's *weekly* average, last
  night is a distinct data point). One `repeat(auto-fit, minmax(140px,
  1fr))` grid, no per-category grouping, so it renders as a single even row
  at desktop width instead of several ragged ones.
- **Everything else moved behind one `<details>` toggle** ("More metrics"),
  not six. Categories survive as plain sub-labels (`MetricSubgroup`, not
  independently collapsible) purely for scannability once expanded — the
  fix was collapsing six *toggles* into one, not removing the category
  organization entirely.
- Training Readiness score was originally slated for the primary grid but
  the current data has it null (this account doesn't have a Garmin-
  computed readiness score populated) — it still renders conditionally
  when present, just doesn't reserve a visible slot when absent, consistent
  with how the rest of this grid already handles missing fields.

## Dashboard KPIs v2 — ACWR into the pills, the rest onto Progress or cut

One round later, Adrian went further: even the curated 6-tile grid was more
than the dashboard needed daily. Only ACWR (the one flagged "Danger" in
testing) earned a spot in `ReadinessStrip`'s pill row alongside TSB/Battery/
HRV/Sleep — same pill shape, same `rgbVar()` tinted-pill styling, threshold
copied from the removed `acwrBadge()` (Danger >1.5, High load >1.3, ok
≥0.8, Underload below). The rest of the grid and the entire "More metrics"
`<details>` were deleted outright, not just hidden — with them went every
helper that only existed to feed them: `Kpi`, `MetricSubgroup`,
`acwrBadge`/`monotonyBadge`/`bodyBatteryBadge`/`readinessBadge`/`hrvBadge`,
`formatLTPace`, the `DeltaBadge` import, and the `kpiAsOf` variable.
`fmtRaceTime` survived — it's still used by the Goals section's race-
prediction cards, untouched by this pass.

Before cutting, Adrian asked specifically to preserve long-term trends for
VO₂max, predicted 5K time, and bench e1RM (Epley) on the Progress page:

- **VO₂max already had a trend chart** — `report/page.tsx` already builds
  it from `daily_metrics.vo2max_running`/`vo2max_cycling`. Nothing to add,
  just confirmed live (95 days of history, 54.0 ml/kg/min).
- **Bench e1RM and predicted 5K did not** — both live only as single
  snapshot columns on the *latest* `analyses` row (what the dashboard's
  Goals cards already read). Since `analyses` is one row per report/check-
  in, the full history of those two columns *is* a ready-made time series
  with zero new storage — added a `report_date, bench_e1rm_kg,
  predicted_5k_secs` query (full history, no `.limit()`) and pushed two
  more `TrendSeries` after the existing CTL/ATL/etc. construction,
  independent of which branch (`useDailyMetrics` vs. fallback) built the
  rest, since these come from `analyses` either way. Predicted 5K's
  seconds are converted to minutes (`/60`) before charting — a raw-seconds
  axis reads badly next to the other decimal-scale charts.
- **Verified with a direct SQL query** (Supabase MCP `execute_sql`) rather
  than assuming from the UI alone when "Predicted 5K" didn't render: the
  column genuinely only has 2 non-null values so far (both from the last
  two days), one short of `ProgressTabs.tsx`'s existing `activeSeries`
  filter (`data.filter(v => v !== null).length >= 3`) that hides any
  series without enough points to show a real trend. Not a bug — just not
  enough check-ins yet. Originally added a redundant `>= 2` gate of my own
  in `report/page.tsx` before finding this; removed it once ProgressTabs'
  real `>= 3` threshold was confirmed, rather than leave two thresholds
  that could drift out of sync. Bench e1RM cleared the bar easily (7+
  non-null points) and renders correctly.

## `SicknessWatchCard` — composite early-illness signal, no backend changes

Adrian asked for a dedicated "is something going on" tracker after a
discussion of what actually predicts oncoming illness in wearable data: no
single metric is reliable alone, but HRV suppression, elevated resting HR,
and poor Body Battery recharge moving off-baseline *together* is the
pattern consumer wearables (Whoop, Oura) actually act on.

- **All three signals were already flowing into `daily_metrics`**
  (`hrv_overnight`, `rhr`, `body_battery`) — no migration, no Python
  pipeline change, no new Garmin data needed. (Respiration rate, mentioned
  in the same conversation as another useful signal, is *not* wired this
  far yet — `services/garmin/data_extractor.py` parses it out of the raw
  Garmin payload but never writes it to `daily_metrics`/`kpis`, so it was
  left out of this card rather than scope-creeping into a backend change
  nobody asked for yet.)
- **Personal baseline, not a fixed threshold** — each signal is compared
  against its own mean ± 1 SD computed from the trailing 28 days
  (`sicknessWindowStart`), excluding today so today's reading can't skew
  its own baseline. This matters concretely: this account's Body Battery
  baseline is unusually low (~29%, likely a genuinely low-recovery
  training block), so a flat "below 50% = flagged" rule would show
  red constantly. Comparing to *this person's* baseline instead — verified
  live, today's 37% correctly shows "Normal" since it's actually above
  their own baseline, not a false alarm from a generic cutoff.
  Minimum 7 baseline days required before a signal is scored at all
  (fewer treated as "building baseline," not silently flagged either way).
- **Status tiers require multiple signals, not one** — 0 flagged is green
  "All signals normal," exactly 1 is amber "worth watching" (a single
  metric drifting is common and not very predictive alone), 2+ is red
  "possible early illness." This directly encodes the "moving together"
  framing from the conversation, rather than alerting on any single noisy
  metric.
- **Native `<details>`/`<summary>`, no client component** — the collapsed
  summary line *is* the at-a-glance view Adrian asked for (status pill
  always visible), expansion reveals the three signals with each one's
  actual value, its baseline, and normal/flagged — no `useState` needed,
  same low-complexity pattern the removed "More metrics" toggle used.
- Placed as its own full-width section between the fitness-trend/recent-
  sessions row and `DashboardActions` — no natural bento partner at its
  compact collapsed size, so it stays standalone rather than being forced
  into a pairing (same reasoning already applied to `DashboardActions`
  and `Goals` earlier in this file).

## `SicknessWatchCard` v2 — 5 signals, respiration + sleep stress + Body Battery recharge

Adrian caught the gap directly: "have you not forgot respiration rate? ... we
need a smart solution to check the stress score during sleep ... change the
body battery KPI which is useless in itself, to a check if the recharge rate
of the body battery overnight is less than a normal measurement." This meant
wiring one already-parsed-but-unused field (respiration) plus two genuinely
new fields (sleep-window stress, overnight Body Battery recharge) through the
full pipeline: Garmin API → `data_extractor.py` → `history_sync.py` →
`plan_writer.py`'s `ALLOWED` set → migration `033_sickness_watch_signals.sql`
→ dashboard query. `SicknessWatchCard.tsx` itself needed zero changes — it
was already fully data-driven off a `signals` prop array.

- **Body Battery Recharge replaces raw Body Battery**, not adds to it — a
  single end-of-day percentage doesn't say much on its own (this account's
  own baseline is ~29%, nowhere near a generic "healthy" cutoff, per the v1
  section above). `services/garmin/data_extractor.py`'s `get_body_battery()`
  now correlates each day's `bodyBatteryValuesArray` timeline against that
  day's sleep window (`sleepStartTimestampGMT`/`sleepEndTimestampGMT`,
  falling back to the `Local` variants) via a new `_nearest_body_battery_level()`
  helper, and returns `overnight_gain = wake_level - start_level` alongside
  the existing `end_of_day` value.
- **Two Garmin field names were unverified guesses going in**
  (`dailySleepDTO.avgSleepStress` for sleep-window stress, and the sleep
  start/end timestamp field names for the Body Battery correlation — inferred
  from this same file's existing `startTimeGMT`/`startTimeLocal` convention
  for activities, not confirmed against a real payload). Adrian explicitly
  chose "implement + verify via a real sync" over guessing blind or holding
  off, and separately authorized the full backend scope (migration + Python
  pipeline, not just a web-side stub).
- **Verified correct on the first sync** — a real sync against Adrian's
  Garmin/Supabase account (run in an isolated `.venv_verify`, since the repo
  had no committed virtualenv and `requirements.txt` is itself missing
  `pyyaml` as a listed dependency — worth fixing in `requirements.txt`
  directly if this bites again) populated 4 consecutive days
  (2026-07-15 → 07-18) with sane values on the first attempt: respiration
  ~13 br/min, sleep stress 9-12/100, Body Battery overnight recharge
  59-82 pts. No field-name corrections were needed. Confirmed via direct
  Supabase SQL query, then confirmed again live in the browser — the card
  renders all 5 signals, with HRV/RHR (25 days of pre-existing history)
  scoring normally and the 3 new signals correctly showing "Building
  baseline — need 7+ days" rather than a premature true/false verdict,
  since only 4 days of history exist for them so far. They'll start scoring
  automatically once the trailing 28-day window accumulates 7+ non-null
  days — no further action needed, this is the designed behavior for a
  freshly-added signal, not a bug.

## `TodaySessionCard` v2 — fixed height, drop the gradient/left-line style, grow `WeeklyMacrosCard`

Adrian wanted the hero session card to stop varying with session content (a
7-exercise strength day rendered much taller than a rest day), to drop the
`card-accent`/`card-cyan` gradient-wash + 4px colored left border, and to use
the freed-up sizing lever to give `WeeklyMacrosCard` more room while staying
bottom-aligned with "This Week" — continuing the same right-column-fills-
available-space pattern from the "Hero row v3" section above.

- **Why shrinking the card doesn't automatically grow Macros**: the hero row's
  height is driven by whichever column's *natural* content is taller — before
  this change that was consistently the left column (session + This Week), so
  the grid stretched the right column (calendar + Macros) to match, and
  Macros absorbed the difference via `flex: 1`. Naively making the session
  card *shorter* would shrink the left column below the right column's own
  minimum, flipping which column drives the row and defeating "stays a fixed
  size." The fixed height needed to land *at or above* the tallest previous
  variable case for the left column to keep driving — so this is a case where
  a fixed size reads as compact/consistent per-card, while still growing the
  row overall.
- **Table removed from the dashboard face entirely** — previously the card
  inlined up to 5 exercise rows (sets/reps/rest/intensity/weight rec) with a
  "+N more" row. That's what made height genuinely unbounded across session
  types. Replaced with a compact exercise-name chip row (`CHIP_LIMIT = 6`,
  same "+N more" idea but as a badge, not a table row) and a `marginTop: auto`
  "View full session" link pinned to the card's bottom, opening the same
  `SessionDetailModal` used by the calendar (which already shows the full
  table, weight recs, purpose/adaptation, and completed-activity data — none
  of that was lost, just moved one click away). Verified against a real
  7-exercise strength day (Bench Heavy + Legs) that the chip row wraps to
  ~2-3 lines and stays well inside the fixed height with room to spare.
- **First attempt at pinning the CTA was wrong**: gave the content wrapper
  `flex: 1` inside the fixed-height flex column, expecting it to push the
  button down. It does — but the wrapper's own children stay top-aligned
  within that expanded space (it's a plain block div, not itself a flex
  container), so the button ended up floating in the middle of a lot of
  blank space rather than pinned to the card's bottom edge. Fixed by dropping
  `flex: 1` from the content wrapper (natural height) and giving the button
  `marginTop: "auto"` directly in the outer flex column instead — the
  standard "pin to bottom of a flex column" pattern, worth remembering for
  any future fixed-height card with a trailing CTA.
- **`TODAY_SESSION_CARD_HEIGHT = 380`** (exported from `TodaySessionCard.tsx`,
  reused by `page.tsx`'s separate "no schedule at all" placeholder for the
  same fixed size) — picked empirically via `getBoundingClientRect()`, same
  practice as the rest of this hero-row work: 340px grew Macros from 220px to
  254px; 380px grew it to 294px with a comfortable, not-empty-looking amount
  of blank space below today's (short run-day) content. Verified bottom
  edges: This Week card and `WeeklyMacrosCard` both end at the same `y`
  (747px in the measured run), confirming the existing stretch/flex-1
  mechanism from "Hero row v3" still holds — no changes needed there, only
  the session card's own sizing changed.
- **Key-session signaling preserved without the gradient wash** — the type
  label already appended " · Key session" in `--accent` color; that alone
  carries the signal now that the whole-card tint is gone, so no information
  was lost, just the heavier visual treatment.

## Plan page — weekly time-by-type stats, as an 8th column per calendar row

Adrian asked whether the Plan view could show, per week, how many minutes
are planned for each training type ("xx minutes of running, xx minutes of
strength"). First cut placed it inline *below* each week's row
(`AskUserQuestion` — Adrian picked "inline in the calendar" over a separate
summary card or click-to-expand panel), but a direct follow-up corrected the
placement: to the **right** of each week's 7 day cells, not underneath.

- **No backend/schema change needed** — strength sessions already have
  `estimated_duration_secs`; other session types only have duration embedded
  in the free-form `scheduled_days.description` text (e.g. "15min Z2
  warm-up, 20min Z4 continuous @4:50/km, 10min Z2 cool-down"), which was
  already being parsed for the session-detail duration badge.
- **Extracted the duration parser out of `SessionDetailModal.tsx`** into
  `web/lib/duration.ts` — it was three private, unexported helper functions
  (`sumMinuteTokens`, `estimateDistancePaceMinutes`, and a
  string-returning `parseDurationLabel`) with no way to reuse the underlying
  number. Split into a shared `computeDuration()` core (same exact branching
  as the original: grouped `N×(...)` intervals → legacy `A×Bmin` shorthand →
  a single bare stated duration shown exactly as-is → fallback token sum) and
  two thin exports off of it: `estimateDurationMinutes()` (plain number, new,
  used for aggregation) and `formatDurationLabel()` (the original string
  behavior, renamed, still used by the modal's duration badge). Verified live
  that the modal's duration badge is byte-identical post-refactor (a real
  3-segment run day still shows "~45 min").
- **Week rows reuse `buildMonthCells()`'s existing grid, no new week-boundary
  utility** — it already returns a flat, Monday-start array padded to a
  multiple of 7, so every consecutive 7-cell chunk *is* one calendar week.
  `PlanCalendar.tsx` chunks `cells` into weeks, sums each week's chunk by
  `session_type` (strength via `estimated_duration_secs / 60`, everything
  else via `estimateDurationMinutes(description)`, rest days excluded).
- **`.cal-grid` is an 8-column grid, not 7** (`grid-template-columns:
  repeat(7, 1fr) minmax(130px, auto)`) — the summary panel is a real 8th
  grid item per row (vertically stacked type/duration lines, left border to
  separate it from the day cells), not a full-width row spanning underneath.
  `DAY_HEADERS` gets a matching empty 8th header cell so the header row's
  columns still line up. Each week's 7 day cells + 1 summary cell are still
  grouped under a `display: contents` wrapper (doesn't generate its own box,
  so its 8 children behave as direct grid items) — same technique as the
  first cut, just without the old `grid-column: 1 / -1` override.
- **The summary cell always renders, even with zero data** — under the old
  "row below" layout, a week with nothing planned could just skip rendering
  the row entirely. In an 8-column grid that's no longer safe: CSS Grid's
  auto-placement is sequential, so skipping a cell would shift every
  following week's cells one column to the left. The cell is always present;
  it's just visually empty (no border-separated content) when a week has no
  planned totals — e.g. the trailing Aug 27-31 partial week past the plan's
  `end_date`.
- **Real HMR gotcha hit while iterating**: after editing `.cal-week-summary`
  in `globals.css` a second time (row → column layout, dropping
  `grid-column: 1/-1`), the dev server's fast refresh applied the `.cal-grid`
  column-count change but kept serving the *old* `.cal-week-summary` rule —
  confirmed via `getComputedStyle()` showing `grid-template-columns` with 8
  tracks (new) alongside `.cal-week-summary`'s `display: flex; flex-direction:
  row` and full-width position (old), a genuinely inconsistent mixed state,
  not just "haven't refreshed yet." A second `globals.css` edit didn't fix
  it either — needed a full dev-server kill + restart to clear. Matches this
  repo's known "`globals.css` edits often don't trigger HMR" issue; when a
  `getComputedStyle()` check shows a rule that doesn't match the source file,
  restart the server before spending more time editing the same file.
- Reuses `formatDuration(secs)` from `lib/dates.ts` (pass `minutes * 60`)
  rather than writing a second minutes-to-label formatter — same "~Xh Ym"
  convention already used for strength session badges.

## Plan page v3 — "Week N" blocks replace month sections, weeks never split

Adrian asked to make the calendar "more proper": a visible "Week N" label
per week (stats back underneath the row, not the v2 side-column), and —
the real structural ask — weeks that cross a month boundary should be
"synchronised" instead of appearing twice.

- **Root cause of the "not synchronised" problem**: the calendar was built
  month-by-month (`monthsInRange` + `buildMonthCells` per month, each month
  its own 7-column grid). A week straddling two months (e.g. Jul 27 – Aug 2)
  had no single home — it rendered as two *partial* rows, Jul 27-31 at the
  bottom of July's grid and Aug 1-2 at the top of August's grid, each with
  its own incomplete stats total. Fixing this needed abandoning the
  month-grouped structure entirely, not just a styling tweak.
- **New `weeksInRange(start, end)`** in `web/lib/calendar.ts` replaces
  `monthsInRange` + `buildMonthCells` for this page — walks Monday-to-Monday
  across the whole date range and returns complete 7-day weeks with zero
  month awareness. A week is just 7 consecutive real dates; there's no
  `iso: null` padding case at all (unlike `buildMonthCells`, which nulls
  out days belonging to an adjacent month by design — the right behavior
  for a single-month grid, wrong for a month-agnostic one). One straddling
  week is now exactly one array of 7 cells, so `weekTypeTotals()` sums it
  once, correctly, with no code changes needed there — the fix is entirely
  in how cells get grouped before that function ever runs.
- **Month header removed, replaced with `Week N`** (sequential, 1-indexed
  over the whole plan) as the primary section label. Since there's no
  per-month grid anymore, month context is shown inline instead: any cell
  where `day === 1`, or the very first cell in the whole calendar, gets a
  small "Jul"/"Aug" prefix next to its day number (`.cal-num-month`) —
  computed as a pure per-cell check (`cell.day === 1 || cell.iso ===
  firstIso`), no mutable state threaded through the render.
- **Stats moved back under the row** (reverting v2's right-hand 8th-column
  layout) — `.cal-grid` is a plain 7-column grid again, and
  `.cal-week-summary` is a sibling `<div>` below it, not a grid item inside
  it. This also simplified the JSX: v2 needed a `display: contents` wrapper
  per week so the summary cell could participate in the day-cell grid as an
  8th column; with the summary living outside the grid entirely, that
  wrapper is gone.
- **A real, hard-to-diagnose caching bug hit while verifying**: after
  editing `.cal-grid`'s `grid-template-columns` back down to 7 columns,
  `getComputedStyle()` kept reporting the *old* 8-column value even after a
  full dev-server kill + restart — not just a missed hot-reload. Turbopack
  persists a build cache on disk (`web/.next/`) across process restarts, so
  a plain restart wasn't enough; only deleting `web/.next/` and starting
  fresh actually picked up the change. Symptom to watch for: if
  `getComputedStyle()` on a changed rule still shows the old value *after*
  restarting the dev server (not just after editing), the fix is `rm -rf
  .next`, not another restart.
- Verified live against the real plan: Week 1 correctly shows a leading
  "Jul 13" (the very first cell), Week 3 spans Jul 27 – Aug 2 as one row
  with one combined total ("Strength ~3h 4m · Run ~2h 36m", correctly
  summing both months' days), and the plan's last week (ending mid-week at
  Aug 26) no longer leaves a dangling near-empty trailing row for Aug 31 —
  a side effect of the old month-grid approach always rendering out to the
  end of the queried month regardless of where the plan actually ended.

## Plan page v4 — reverted to month-grid, stats to the right, weeks split again

The v3 "Week N" redesign turned out to be a step too far: Adrian said it
"lost the sense of a calendar at all." He wanted the month-grouped grid
back (real "July 2026" / "August 2026" sections), the weekly stats back on
the right of each row (v2's layout, not v3's under-row layout) — and
explicitly confirmed a week straddling two months should go back to
appearing **twice**, once per month, each with its own partial total. Not
a bug to fix; the correct behavior for something that's meant to read as an
actual calendar rather than a flat list of training weeks.

- **Reverted `PlanCalendar.tsx` to the v2 structure**: `monthsInRange` +
  `buildMonthCells` per month (month header + 7-column day grid), each
  week-chunk still wrapped in `display: contents` so its `.cal-week-summary`
  can sit as an 8th grid column to the right — same technique as v2, just
  re-applied after v3 had replaced it with `weeksInRange` + a below-row
  summary.
- **Deleted `weeksInRange()`** from `web/lib/calendar.ts` — it existed only
  to support v3's month-agnostic week iteration, and has no other caller
  now that PlanCalendar is back to `buildMonthCells`. Don't resurrect it
  without a real reason; if "week N, unified" comes back later it's a
  five-minute rewrite from this history, not worth keeping dead code around
  for.
- **`.cal-week-label` and `.cal-num-month` (the inline "Jul"/"Aug" prefix
  on month-crossing day cells) also removed** — both were v3-only: the
  per-week "Week N" heading is gone (month headers again carry that role),
  and the inline month-abbreviation trick was only needed because v3 had no
  month header to supply that context; back in a month-grid, every visible
  day cell already unambiguously belongs to its section's declared month.
- **Same disk-cache gotcha bit again** — after reverting `.cal-grid` back
  to 8 columns, `getComputedStyle()` still showed the *previous* (v3)
  7-column value even after killing and restarting the dev server process.
  `rm -rf web/.next` before restarting was required again, confirming this
  isn't a one-off: any `globals.css` grid-template-columns change on this
  page should be verified with `getComputedStyle()`, and if it's stale
  after a plain restart, clear `.next` before assuming the change itself is
  wrong.
- Verified live: month headers are back, Jul 27-31 (in July's grid) and
  Aug 1-2 (in August's grid) now show two separate partial totals for what
  is the same calendar week, matching the explicit ask, and click-to-open
  the session modal still works from a day cell.

## Redesign completion pass — the rest of the app catches up to the light-mode token system

Went looking for the three remaining untouched pages from the original
redesign plan (Week, Setup Wizard, Profile) and found the real scope was
much larger: ~130 hardcoded dark-mode-only colors (`rgba(255,255,255,X)`
overlays, raw hex reds/ambers/greens/blues) still scattered across
`NutritionClient.tsx`, `MealManagerModal.tsx`, `MealBuilderModal.tsx`,
`WeeklyMealPlanModal.tsx`, `WeekStrip.tsx`, `WeightCard.tsx`,
`ReplanPanel.tsx`, `SetupWizard.tsx`, `DashboardActions.tsx`,
`SessionDetailModal.tsx`, `PlanCalendar.tsx`, `report/ProgressTabs.tsx`,
`report/page.tsx`, and a couple smaller files — none of these had been
touched since the Phase-1 token rewrite. Flagged the scope explicitly
before starting since it was ~5-10x bigger than "a couple of page polishes."

- **New `--overlay-rgb` token** (raw RGB triplet, no fixed alpha:
  `0,18,25` light / `255,255,255` dark) added alongside the existing
  `--overlay-1` … `--overlay-5` graduated scale. The existing scale only
  covers a handful of fixed alpha steps; the wild hardcoded values used
  dozens of different alphas (.02 through .35) chosen per-component for a
  specific visual weight. Remapping each to the *nearest* existing step
  would have subtly changed each component's look; `rgba(var(--overlay-rgb),X)`
  instead preserves every original alpha exactly while making the base
  color theme-aware — a straight mechanical substitution, not a redesign.
- **Colored raw values mapped to their existing semantic tokens**, alpha
  preserved: `255,180,0` / `255,204,102` (raw amber) → `rgba(var(--amber-rgb),X)`,
  `255,92,122` (raw red) → `rgba(var(--red-rgb),X)`, `56,217,150` (raw green)
  → `rgba(var(--green-rgb),X)`. Also added `--dim-rgb` (was missing) for a
  couple of neutral-fallback fill cases in `ProgressTabs.tsx`.
- **Two real exceptions found and deliberately left alone**:
  `BarcodeScanner.tsx` (white UI overlaid on a live camera feed) and the
  "Analyzing meal…" scrim inside `PhotoFoodCapture.tsx` (white caption text
  on a dark scrim over a captured photo). Both are correctly
  theme-independent — they're not rendered against the app's background,
  they're rendered against a camera/photo, so "fixing" them to follow the
  light/dark toggle would have actually broken them. Modal backdrops
  (`rgba(0,0,0,.6-.75)`, used consistently by every modal in the app) were
  also left alone for the same reason — a dark scrim behind a modal is a
  deliberate, universal convention, not a light-mode bug.
- **Redundant `var(--color, #hex)` CSS fallback syntax simplified** to
  plain `var(--color)` in `SetupWizard.tsx`, `dev-preview/page.tsx`,
  `BarcodeScanner.tsx`, and `LoginCard.tsx` — the fallback never fired
  (the referenced custom properties are always defined), so it was dead
  literal-hex weight sitting next to the real token for no reason.
- **Nutrition's carbs identity color swapped from `--cyan` (pearl-aqua) to
  `--blue` (dark-teal)** — 17 occurrences, all either directly rendering
  carb values as text (`C39g` badges throughout meal cards, search
  results, the macro pills, `MacroBar`'s numeric label) or feeding into
  such text. Pearl-aqua is documented as background/border-only, fails
  contrast on white — this was the exact bug flagged (and deliberately
  deferred) during `WeeklyMacrosCard`'s build. `--blue` keeps the "cool
  color" identity distinct from protein's `--accent` and fat's `--amber`
  without introducing a new token; `MacroBar`'s bar-fill for carbs also
  moved from pearl-aqua to dark-teal as a result (same prop drives both
  fill and label text), a minor, acceptable shade change in exchange for
  fixing the real text-contrast bug.
- **Progress page chart colors remapped to design tokens**: `SEV` severity
  colors (`optimal`/`warning`/`danger`/`neutral`), the CTL/ATL line colors
  in the embedded PMC mini-chart, and the RHR/ramp-rate/weight trend-series
  colors in `report/page.tsx` were still literal hex values left over from
  before the redesign (e.g. CTL was `#60a5fa`, a generic sky-blue with no
  relation to the palette, while the *dashboard's* `FitnessTrendChart` had
  already been redesigned to use `var(--accent)` for the same metric —
  the two CTL/ATL charts were visually inconsistent with each other).
  Mapped CTL→`--accent`, ATL/RHR/danger→`--red`, ramp-rate/optimal→`--green`,
  weight/neutral-fallback→`--dim`, warning→`--amber`, matching each color's
  actual semantic meaning rather than a blind find-replace. **Not done**:
  threading `<linearGradient>` fills through the remaining Progress charts
  (the original plan's "gradient-fill" item) — that's a visual enhancement,
  not a bug, and was deliberately left for a dedicated pass rather than
  folded into this correctness-focused sweep.
- **Dark-mode toggle shipped** — `ThemeToggle.tsx` (new, in `profile/`),
  a two-segment button matching the exact visual pattern already
  established by the Nutrition page's g/oz unit toggle (same
  `rgba(124,92,255,.15)` active-segment tint, same border/radius), added
  to a new "Appearance" section on the Profile page. `useTheme()` from
  the existing `ThemeContext.tsx` (mounted but inert since Phase 1) is all
  that was needed — every page already had working `[data-theme="dark"]`
  CSS. Verified live: toggling switches the whole app instantly, persists
  across a reload, and every page checked (dashboard, plan, nutrition,
  profile) rendered correctly in dark mode with no leftover light-only
  styling — confirming the Phase-1 dark-mode token work was solid, it just
  had no UI to reach it until now.
- **Caught and stopped a real mistake mid-verification**: rapid-clicked
  "Continue" through the live Setup Wizard while spot-checking its styling,
  which is a real multi-step form that persists to Supabase on every step
  — not a safe thing to click through carelessly on the user's actual
  account data. Backed out immediately via direct navigation rather than
  continuing to click through it; confirmed via the Profile page afterward
  that the real profile answers were unchanged. Lesson: browser-verifying
  a *form* page needs more care than a read-only page — screenshot what's
  there, don't drive multi-step flows with real side effects during a
  styling check.
