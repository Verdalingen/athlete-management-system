import json
import logging
import os
from datetime import date, datetime, timedelta
from typing import Any

from services.ai.ai_settings import AgentRole
from services.ai.langgraph.schemas import AgentOutput
from services.ai.langgraph.schemas.agent_outputs import WeeklyPlanOutput
from services.ai.langgraph.state.training_analysis_state import TrainingAnalysisState
from services.ai.langgraph.utils.message_helper import normalize_langchain_messages
from services.ai.langgraph.utils.output_helper import extract_agent_content, extract_expert_output
from services.ai.model_config import ModelSelector
from services.ai.utils.retry_handler import AI_ANALYSIS_CONFIG, retry_with_backoff
from services.garmin.training_paces import build_training_paces_context
from services.supabase.athlete_profile import build_strength_templates_context, get_strength_session_templates
from services.supabase.plan_writer import get_next_strength_slot

from .node_base import (
    configure_node_tools,
    create_cost_entry,
    execute_node_with_error_handling,
    log_node_completion,
)
from .prompt_components import get_hitl_instructions, get_workflow_context
from .tool_calling_helper import handle_tool_calling_in_node


def _safe_expert(output: Any, field: str) -> str:
    """Return expert analysis for `field`, or empty string if output is unavailable."""
    if output is None:
        return ""
    return extract_expert_output(output, field)

logger = logging.getLogger(__name__)

WEEKLY_PLANNER_SYSTEM_PROMPT = """## Goal
Create detailed, practical training plans that balance stress and recovery.
## Principles
- Adaptation: Progressive overload with adequate recovery.
- Specificity: Training must match the demands of the event.
- Individualization: Adapt to the athlete's current state and history."""

WEEKLY_PLANNER_USER_PROMPT = """## Task
Create a detailed training plan covering all {num_days} days listed in Upcoming Weeks below.

## Constraints
- **Honor the Phase**: Prioritize the Season Plan's phase intent.
- **Follow the Chosen Methodology (hard rule)**: The Season Plan's "Programming Methodology"
  section states which periodization approach was chosen for strength and for cardio and why, and
  its "Weekly Session Structure" section states an explicit per-lift/movement-pattern frequency
  and session-combination spec (e.g. how many times/week each major lift is trained, and which
  movement patterns share a session). Apply that structure LITERALLY — the exact session count and
  lift/movement combination per session — not just the general intensity feel of the approach
  (e.g. varying hard/easy for DUP is necessary but not sufficient). Do not fall back to a generic
  template (like a single Upper A/Upper B/Legs rotation) that ignores the season plan's stated
  structure. This is separate from — and checked in addition to — Recovery Spacing and Preserve
  Accessory Work below: those check calendar placement and per-session volume; this checks whether
  the count and combination of sessions matches the stated structure at all.
  Wrong: Season Plan states an explicit per-lift weekly frequency and session-combination spec,
  but the week's actual strength sessions don't match that count or combination — e.g. the spec
  calls for a lift to appear in multiple sessions per week and/or for specific movement patterns to
  be combined together, but the generated week instead uses a single weekly hit per lift via a
  generic split, or separates movement patterns the spec said to combine.
  Right: the week's strength sessions literally match the stated frequency and movement
  combination for every lift/pattern named in the Season Plan's Weekly Session Structure section —
  count the sessions each major lift appears in before finalizing and compare against the spec.
- **Strength Session Content (hard rule)**: You do NOT decide which exercises, sets, or reps
  appear in a strength session — the athlete has a fixed, saved template for each of their 3
  strength session slots (A/B/C), provided as read-only reference in the Strength Session
  Templates section below. Your only job for strength days is scheduling: decide which dates get
  which slot (in the `strength_sessions` structured field, as `{{date, slot}}` pairs), respecting
  Recovery Spacing and Legs Before Hard Runs below. Do not invent, reorder, add, or drop
  exercises — that would silently diverge from what the athlete actually has saved and expects.
  Use the templates only to write an accurate PURPOSE/description narrative in the markdown plan
  and to choose an appropriate `focus` label for `scheduled_days` (matching the slot's name).
- **Frequency vs Load (hard rule)**: Adding a session is NOT the same as adding training stress.
  An easy Z1/Z2 run, technique work, or light aerobic volume adds frequency at minimal load cost.
  The athlete's `sessions_per_week` figure in User Context is stated as "a baseline, not a cap —
  expand with readiness": treat it as a floor to actively try to EXCEED via easy sessions, not a
  target to merely reach. Per the Respect Readiness constraint below: if Physiology/Metrics have
  NOT flagged an active recovery concern, do not default to a Rest day just because nothing hard
  is scheduled — schedule a genuinely easy, non-key session instead. Reserve full Rest days for
  when recovery signals actually call for them, or for deliberate placement after key sessions —
  never as filler for landing at or below the athlete's stated baseline.
  Wrong: baseline 5, athlete asked for more, week has 5 sessions + 2 Rest days.
  Right: week has 6-7 sessions, with the added days being easy Z1/Z2 runs, Rest reserved for an
  actual recovery signal or planned placement.
- **Build the Stated Aerobic Base (hard rule)**: If the Season Plan's cardio methodology calls for
  a predominantly-easy aerobic base (e.g. polarized or pyramidal training), the week's schedule
  MUST include genuinely easy runs (session_type "run", is_key_session=false, is_rest=false — e.g.
  focus "Easy Aerobic" or "Recovery Run") to build that base. Do not mark every running session as
  key, and do not substitute a Rest day for what the methodology says should be easy volume.
- **Respect Readiness**: Adjust intensity based on Physiology/Metrics signals (e.g., pull back if recovery is low).
- **Integrate Signals**: Use Activity Expert advice for session structure.
- **Recovery Spacing (hard rule)**: Never schedule two strength sessions that train overlapping
  major muscle groups on adjacent calendar days — e.g., two upper-body sessions back-to-back, or
  two leg sessions back-to-back. Leave at least one full day between them. This applies across the
  *entire* multi-day/multi-week schedule you're producing in this single output, including the
  boundary between one week and the next — check your last strength session of week N against your
  first strength session of week N+1 before finalizing, not just within each week in isolation.
- **Legs Before Hard Runs (hard rule)**: Any strength session whose template includes leg work
  (squat, RDL, BSS, hip thrust, split squat — check the Strength Session Templates section below
  for which slots carry legs) must be scheduled at least 48 hours before any key run session
  (interval/VO2max or tempo/threshold). Easy aerobic runs are exempt from this rule — it only
  applies to hard/key run days. Check this across the week boundary the same way Recovery Spacing
  does. This has been violated in past generations specifically for VO2max — do not treat VO2max as
  a lighter exception just because it's shorter than tempo; it still requires the full 48h gap.
  Wrong: a leg-carrying strength session on Friday, then VO2max intervals on Saturday — only ~24h
  apart, well under 48h, even though they're on different calendar days.
  Right: a leg-carrying strength session on Friday, then the next key run (VO2max or tempo) no
  earlier than Sunday — a full rest or easy day sits between them.
- **Strength Session Order (hard rule)**: Strength sessions must cycle through slots A, B, C in
  that exact order, repeating (A, B, C, A, B, C, ...), with no skipping, reordering, or repeating a
  slot out of turn. The Next Strength Slot value given in the Inputs section below is the slot the
  *next* strength session you schedule must use — assign it to whichever calendar date you choose
  for that session, then continue the rotation (in calendar order) for every subsequent strength
  session you schedule in this output. You have full freedom over which calendar dates get a
  strength session (subject to Recovery Spacing and Legs Before Hard Runs above) — only the slot
  *order* is fixed, not the day-of-week.
- **Hard Run Spacing (hard rule)**: Never schedule two key run sessions (interval/VO2max and
  tempo/threshold) on adjacent calendar days — leave at least one easy or rest day between them.
  Stacking two hard run days back-to-back compounds fatigue into the second session (degrading its
  quality) and raises injury risk; this applies across the week boundary the same way Recovery
  Spacing does.
- **Preference Precedence (hard rule)**: The athlete's User Context below can contain multiple,
  sometimes overlapping statements of preference — a specific Recurring Session Request and a more
  general Soft Preference elsewhere may both speak to the same exercise. When a Recurring Session
  Request gives an explicit, literal number (sets, reps, exercise order, exact exercise name) for a
  session, that number is authoritative for that exercise — do not let a general Soft Preference
  (e.g. "prefers fewer sets taken to failure") override or water down a number the athlete stated
  explicitly and specifically for that session. General preferences only fill in what a Recurring
  Session Request left unspecified.
- **Brevity**: Use standard, compact notation (e.g., "5' Z4" not "5 minutes at Zone 4 effort") —
  but brevity means terse NOTATION, not fewer session components. A running session's description
  must still cover every component (warm-up, main effort, cool-down, drills) per the description
  rule below; write each component tersely rather than omitting any of them.
- **Use Current Training Paces (hard rule)**: Every running session — easy aerobic, tempo/
  threshold, AND VO2max intervals — must state a specific pace, not just a zone letter. Use the
  Current Training Paces given in the Inputs section below for every pace you write; these are
  computed fresh from the athlete's actual recent fitness (a real predicted-race-time formula), not
  invented. Do NOT derive a pace from the athlete's stated goal/target race time instead — the goal
  pace is where training is headed, not where it starts, and prescribing goal pace as today's
  session target is unsafe and unachievable. As the athlete's fitness improves over successive
  Check-Ins, the Current Training Paces you're given will themselves get faster and converge toward
  the goal — you don't need to (and must not) accelerate that yourself by writing a faster number
  than what's provided.
  Wrong: athlete's goal is a sub-10:00 3000m (3:20/km average); VO2max interval description says
  "@3:15-3:25/km" because that's close to the goal pace, even though Current Training Paces below
  states something slower.
  Right: VO2max interval description uses the exact vo2max pace range given in Current Training
  Paces below, regardless of how it compares to the athlete's longer-term goal pace.
  If Current Training Paces is empty/unavailable (no current fitness data yet), use zone letters
  only and do not write a specific pace number for that session — never fall back to a goal-derived
  estimate.

## Inputs
### Season Plan
```markdown
{season_plan}
```
### Athlete Context
- Name: {athlete_name}
- Date: ```json {current_date} ```
- Upcoming Weeks: ```json {week_dates} ```
- Competitions: ```json {competitions} ```
- **User Context**: ``` {planning_context} ```

### Strength Session Templates (read-only — do not author exercises, see Strength Session
Content hard rule above)
```markdown
{strength_templates}
```

### Next Strength Slot
The next strength session you schedule must use slot **{next_strength_slot}** — see Strength
Session Order hard rule above for how the rotation continues from there.

### Current Training Paces (read-only — see Use Current Training Paces hard rule above)
```markdown
{training_paces}
```

### Expert Analysis
- Metrics: ``` {metrics_analysis} ```
- Activity: ``` {activity_analysis} ```
- Physiology: ``` {physiology_analysis} ```

## Output Requirements
1. **Zones Table**: Define intensity zones first, using the Current Training Paces given in the
   Inputs section above for the easy/tempo/VO2max pace figures — do not invent your own numbers
   for this table (see Use Current Training Paces hard rule above).
2. **Structure**: Group by week.
3. **Daily Format**:
   - **DAY & DATE**: e.g., "Mon, Nov 24"
   - **FOCUS**: 1-2 words (e.g., "Recovery", "VO2max")
   - **WORKOUT**: Concise structure string.
   - **PURPOSE**: One short sentence.
   - **ADAPTATION**: "If tired: ..."

**Important:**
- Use recent activity data to continue the current training flow and don't start a new phase.
- Use the Season Plan as a guide, but don't force it.
- Place sessions smartly to avoid back-to-back high-intensity sessions.
- Re-read the Recovery Spacing constraint above before finalizing — verify no two strength
  sessions with overlapping muscle groups land on adjacent days anywhere in the schedule.
- Re-read the Preference Precedence constraint above before finalizing — for every exercise where
  a Recurring Session Request gave a specific number, confirm you used that exact number rather
  than a number implied by a general preference elsewhere.
- Re-read the Season Plan's Programming Methodology section before finalizing — confirm the week's
  structure actually reflects the chosen periodization approach, not a generic default.
- Re-read the Season Plan's Weekly Session Structure section before finalizing — for every major
  lift/movement pattern it names a frequency for, count how many sessions that lift/pattern
  actually appears in this week's schedule and confirm the count and combination match. If they
  don't match, fix the schedule, don't just proceed.
- Re-read the Strength Session Content constraint above before finalizing — confirm every
  `strength_sessions` entry is a `{{date, slot}}` pair only, with no invented exercises, and that the
  slot assigned respects Recovery Spacing (below) and the templates' known muscle-group content.
- Re-read the Frequency vs Load and Build the Stated Aerobic Base constraints above before
  finalizing — count how many days this week are Rest vs genuinely easy sessions; if the athlete's
  baseline is N and physiology/metrics gave no red flag, the week should have more than N sessions,
  with the extra days being easy training, not Rest.
- Re-read the description rule above before finalizing — for every running session, confirm its
  description names warm-up, main effort, and cool-down (and drills/strides if applicable) as
  separate components, not just the main effort. A description containing only one duration/effort
  segment for a non-trivial run is a sign a component was dropped — add it back before proceeding.
- Re-read the Strides Placement rule above before finalizing — confirm any strides are attached to
  an easy run, not a tempo/threshold or interval session.
"""

WEEKLY_PLANNER_CHECKIN_INSTRUCTIONS = """
## Check-In Mode
This is a weekly check-in, not a full replan. Follow this process:

1. **Assess** the past week using the Garmin activity data vs the season plan phase intent.
2. **Write `coach_feedback`** — always populate this field. 3-4 concise bullet points:
   - What the data shows (sessions completed, load, any gaps)
   - How it compares to the season plan's current phase
   - Anything to watch (fatigue, missed key sessions, upcoming constraints)
   - What (if anything) is being adjusted and why
3. **Decide on `schedule_updated`**:
   - If the athlete is on track and no changes are needed: set `schedule_updated = false`,
     leave `scheduled_days` empty, and write `output` as a brief summary only (no full plan).
   - If there is meaningful drift, the athlete note requests changes, or key sessions need
     restructuring: set `schedule_updated = true` and produce the full updated schedule.

If the athlete wrote a note under "Athlete Note", treat it as direct instruction — it may
warrant a schedule change, a priority shift, or just an acknowledgment in your feedback.
"""

WEEKLY_PLANNER_FINAL_CHECKLIST = """
## Final Checklist
- Follow the planning horizon and week grouping.
- Do not contradict expert constraints.
- Keep output compact and structured.

## Structured Strength Sessions (strength_sessions field)
When outputting the final markdown plan (not HITL questions), also populate the
`strength_sessions` field with one `{{date, slot}}` entry for every strength day in the schedule —
NOT exercises. See the Strength Session Content hard rule above: the athlete's saved templates
(below, read-only) are the only source of exercise content. Your job here is purely which of the
3 slots (A/B/C) goes on which date, applying Recovery Spacing and normal training-load judgment —
spread the 3 slots across the week rather than clustering, same as any other session-placement
decision.

## Day-by-Day Schedule (scheduled_days field)
When outputting the final markdown plan, populate `scheduled_days` with one entry per day covering
every date in the Upcoming Weeks list ({num_days} entries). In check-in mode, only populate this
if `schedule_updated` is true — leave it empty otherwise.

Rules:
- session_type: "run" for any running session, "strength" for gym work, "rest" for off/recovery
  days, "cross" for other cardio (bike, swim, hike), "race" for competitions.
- focus: 1-3 words that immediately convey what the session IS. Be specific — a reader should
  understand the session type at a glance without reading the description.
  Run focus examples (pick the most accurate):
    "Recovery Run", "Easy Aerobic", "Long Run", "Progression Run",
    "Tempo Run", "Threshold Run", "2k Tempo", "Cruise Intervals",
    "Short Intervals", "Track Intervals", "VO₂max Intervals", "Hill Reps",
    "Fartlek", "Race Pace", "Time Trial", "Strides"
  Strength focus: use the slot_name from the Strength Session Templates section below for
    whichever slot (A/B/C) you assigned this date — do not invent a different label, the focus
    text and the actual slot content should always match.
  Other: "Rest", "Active Recovery", "Cross-Train"
  Never use bare "Easy", "Moderate", "Hard", or "Run" alone.
- description: compact notation as written in the plan (e.g. "4x(800m Z5 @3:50/km, 2min r)").
  Empty string for rest days. MUST include every component of the session, each with its own
  duration or distance — warm-up, the main effort (intervals/tempo/etc.), cool-down, and any
  drills/strides — not just the main effort in isolation.
  Every timed/distance segment needs BOTH a zone letter AND a pace where a pace is available (see
  Use Current Training Paces above) — pace alone without a zone is incomplete, even for interval
  reps. Do not drop the zone letter just because a pace is present.
  Wrong: "20min continuous Z3 @4:15/km" (main effort only, warm-up/cool-down silently dropped).
  Right: "15min Z2 warm-up + 20min Z3 continuous @4:15/km + 10min Z2 cool-down".
  Right (intervals): "15min Z2 warm-up + 5x(1km Z5 @3:50-4:00/km, 2:30min jog r) + 10min Z2
  cool-down" — note the interval reps carry both Z5 AND the pace, not pace alone (no strides here —
  see the strides placement rule below).
  Strides placement (hard rule): if strides are part of the week, they belong at the end of an
  EASY run, not a tempo/threshold or interval session. Legs are fresh after an easy run, so the
  neuromuscular stimulus is high-quality with minimal added fatigue; tacking them onto a
  tempo/interval session means running near-max-velocity strides on already-fatigued legs, which
  blunts the stimulus and adds injury risk right when the athlete should be recovering.
  Wrong: "15min Z2 warm-up + 20min Z3 continuous @4:15/km + 10min Z2 cool-down + 4x100m strides"
  (strides tacked onto a tempo session).
  Right: "35min continuous Z2 + 4x100m strides" (strides on an easy day, tempo/interval days stay
  strides-free).
- is_key_session: true for hard interval sessions, long runs >75min, and heavy strength days.
  Most easy aerobic runs should be is_key_session=false AND is_rest=false — this is a real,
  expected middle category, not an edge case. Marking every non-rest day as key indicates you are
  not building the easy aerobic base your methodology calls for.
- is_rest: true for complete rest and active recovery days.
"""


def _check_recurring_requests_honored(
    scheduled_days: list[dict[str, Any]] | None,
    recurring_session_requests: list[dict[str, Any]] | None,
) -> list[str]:
    """Post-generation visibility check: for each 'must' recurring session request tied to a
    specific day, verify the generated schedule actually contains a matching day/session-type
    entry. A miss does not trigger a regeneration (out of scope for v1 — real risk of retry
    loops for uncertain benefit) — it only surfaces a warning so honoring rates are visible."""
    if not recurring_session_requests or not scheduled_days:
        return []

    warnings: list[str] = []
    for req in recurring_session_requests:
        if req.get("importance") != "must":
            continue
        day_of_week = req.get("day_of_week")
        if not day_of_week:
            continue  # no specific day to verify against

        req_type = req.get("session_type")
        label = req.get("label") or req_type or "session"

        matched = any(
            str(day.get("day_name") or "").lower() == day_of_week.lower()
            and (not req_type or req_type == "other" or day.get("session_type") == req_type)
            for day in scheduled_days
        )
        if not matched:
            warnings.append(
                f"⚠️ Could not confirm '{label}' ({day_of_week.capitalize()}) was scheduled this week — please verify."
            )

    return warnings


# Coarse muscle-group bucket per Garmin exercise category, used only to catch the specific
# failure mode of two strength sessions on adjacent days both hitting the same broad region
# (e.g. two upper-body days back-to-back) — not a precise anatomical model.
_MUSCLE_GROUP_BUCKETS = {
    "BENCH_PRESS": "upper", "FLYE": "upper", "PUSH_UP": "upper",
    "ROW": "upper", "PULL_UP": "upper", "HYPEREXTENSION": "upper",
    "SHOULDER_PRESS": "upper", "LATERAL_RAISE": "upper", "SHOULDER_STABILITY": "upper", "SHRUG": "upper",
    "CURL": "upper", "TRICEPS_EXTENSION": "upper",
    "SQUAT": "lower", "DEADLIFT": "lower", "LUNGE": "lower", "LEG_CURL": "lower",
    "CALF_RAISE": "lower", "HIP_RAISE": "lower", "LEG_RAISE": "lower", "OLYMPIC_LIFT": "lower",
    "CORE": "core", "CRUNCH": "core", "SIT_UP": "core", "PLANK": "core", "CHOP": "core",
}


def _slot_muscle_groups(templates: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Muscle-group buckets ('upper'/'lower'/'core') present in each strength session template
    slot (a slot can have more than one, e.g. a slot combining legs + back + biceps is both
    'lower' and 'upper'). Templates are fixed, so this is exact, not a best-effort guess."""
    by_slot: dict[str, set[str]] = {}
    for row in templates:
        bucket = _MUSCLE_GROUP_BUCKETS.get((row.get("garmin_category") or "").upper())
        if bucket:
            by_slot.setdefault(row["slot"], set()).add(bucket)
    return by_slot


def _check_strength_recovery_spacing(
    scheduled_days: list[dict[str, Any]] | None,
    strength_sessions: list[dict[str, Any]] | None,
    templates: list[dict[str, Any]] | None,
) -> list[str]:
    """Post-generation visibility check: flag adjacent-day strength sessions whose assigned slots
    share a muscle-group bucket (e.g. two slots that both include legs, scheduled back-to-back).
    Same philosophy as the recurring-request check — surface it in coach_feedback, don't
    retry-loop."""
    if not scheduled_days or not strength_sessions or not templates:
        return []

    slot_groups = _slot_muscle_groups(templates)
    slot_by_date = {s.get("date"): s.get("slot") for s in strength_sessions if s.get("date")}
    strength_dates = sorted(
        d.get("date") for d in scheduled_days if d.get("session_type") == "strength" and d.get("date")
    )

    warnings: list[str] = []
    for prev_date, next_date in zip(strength_dates, strength_dates[1:]):
        try:
            gap_days = (date.fromisoformat(next_date) - date.fromisoformat(prev_date)).days
        except ValueError:
            continue
        if gap_days != 1:
            continue

        prev_slot = slot_by_date.get(prev_date)
        next_slot = slot_by_date.get(next_date)
        if not prev_slot or not next_slot:
            continue

        overlap = slot_groups.get(prev_slot, set()) & slot_groups.get(next_slot, set())
        if overlap:
            warnings.append(
                f"⚠️ Slot {prev_slot} ({prev_date}) and Slot {next_slot} ({next_date}) both train "
                f"{'/'.join(sorted(overlap))}-body muscle groups on back-to-back days with no rest "
                "between — please verify recovery spacing."
            )

    return warnings


_ROTATION = ["A", "B", "C"]


def _fix_legs_before_hard_runs(
    scheduled_days: list[dict[str, Any]] | None,
    strength_sessions: list[dict[str, Any]] | None,
    templates: list[dict[str, Any]] | None,
) -> list[str]:
    """Auto-corrects Legs Before Hard Runs violations instead of just warning about them — the
    prompt rule (with a Wrong/Right example) proved unreliable in practice: it stopped one specific
    violation pattern (legs -> VO2max) but the LLM just produced the same underlying mistake against
    a different key run type (legs -> tempo) on the very next real Check-In. Same lesson as the
    Strength Session Order rotation: don't trust the LLM for a mechanically-checkable spacing rule,
    verify and fix it deterministically instead.

    Recomputes the *authoritative* slot per date the same way expand_strength_session_slots() will
    later (continuing the rotation from get_next_strength_slot(), by chronological order) rather
    than trusting the LLM's own `slot` field — that field can drift from what's actually delivered
    (see the focus-label mismatch bug fixed the same day), so leg-detection here must match reality,
    not the LLM's guess.

    For each violation, tries moving the leg-carrying strength session up to 3 days either direction
    onto a rest/easy day (closest shift first), provided the new date (a) still keeps 48h before
    every key run and (b) doesn't land within 1 day of any OTHER strength session whose slot shares
    a muscle-group bucket with this one — not just other leg sessions, since e.g. moving a
    leg+triceps+biceps slot next to an upper-only slot still violates Recovery Spacing on the
    shared upper-body work even though neither slot's legs are involved (this exact gap caused a
    real Recovery Spacing regression the first time this function ran for real — fixed by checking
    against every other strength date's bucket overlap, matching _check_strength_recovery_spacing's
    own logic, not just other leg dates). Swaps the full day content (not the `date` field) between
    the two days, and moves the matching entry in `strength_sessions`. Mutates both lists in place.
    Returns a warning for any violation it couldn't safely resolve within that window — visibility
    fallback, same philosophy as the other post-generation checks.
    """
    if not scheduled_days or not strength_sessions or not templates:
        return []

    slot_groups = _slot_muscle_groups(templates)
    days_by_date = {d["date"]: d for d in scheduled_days if d.get("date")}
    strength_by_date = {s["date"]: s for s in strength_sessions if s.get("date")}

    def is_leg_slot(slot: str | None) -> bool:
        return bool(slot) and "lower" in slot_groups.get(slot, set())

    sorted_strength_dates = sorted(strength_by_date.keys())
    true_slot_by_date: dict[str, str] = {}
    next_slot = get_next_strength_slot()
    for d in sorted_strength_dates:
        true_slot_by_date[d] = next_slot
        next_slot = _ROTATION[(_ROTATION.index(next_slot) + 1) % 3]

    key_run_dates = {
        d for d, day in days_by_date.items()
        if day.get("session_type") == "run" and day.get("is_key_session")
    }

    def violates_any_key_run(check_date_str: str) -> str | None:
        check_d = date.fromisoformat(check_date_str)
        for run_date in key_run_dates:
            gap_days = (date.fromisoformat(run_date) - check_d).days
            if 0 < gap_days < 2:
                return run_date
        return None

    leg_dates = sorted(d for d, slot in true_slot_by_date.items() if is_leg_slot(slot))
    warnings: list[str] = []

    for leg_date in leg_dates:
        conflicting_run = violates_any_key_run(leg_date)
        if not conflicting_run:
            continue

        leg_d = date.fromisoformat(leg_date)
        moving_buckets = slot_groups.get(true_slot_by_date[leg_date], set())
        other_strength_dates = [d for d in true_slot_by_date if d != leg_date]
        # Closest shift first, alternating direction — a smaller disruption to the rest of the
        # week is preferred over a larger one when multiple candidates would work.
        shifts = sorted(range(-3, 4), key=lambda n: (abs(n), n))
        moved = False
        for shift in shifts:
            if shift == 0:
                continue
            candidate = (leg_d + timedelta(days=shift)).isoformat()
            candidate_day = days_by_date.get(candidate)
            if not candidate_day:
                continue
            if candidate_day.get("session_type") not in ("run", "rest", "cross") or candidate_day.get("is_key_session"):
                continue  # only swap onto a rest or genuinely-easy day
            if violates_any_key_run(candidate):
                continue  # would just relocate the same problem
            if any(
                abs((date.fromisoformat(d) - date.fromisoformat(candidate)).days) < 2
                and moving_buckets & slot_groups.get(true_slot_by_date[d], set())
                for d in other_strength_dates
            ):
                continue  # would violate Recovery Spacing against another strength session

            days_by_date[leg_date], days_by_date[candidate] = (
                {**days_by_date[candidate], "date": leg_date},
                {**days_by_date[leg_date], "date": candidate},
            )
            strength_by_date[candidate] = {**strength_by_date.pop(leg_date), "date": candidate}
            logger.info(
                "Auto-corrected Legs Before Hard Runs: moved leg-carrying strength session from "
                "%s to %s (was <48h before key run on %s)",
                leg_date, candidate, conflicting_run,
            )
            moved = True
            break

        if not moved:
            warnings.append(
                f"⚠️ Leg-carrying strength session on {leg_date} is less than 48h before the key "
                f"run on {conflicting_run}, and no safe day within 3 days either direction was "
                "available to auto-correct — please verify manually."
            )

    scheduled_days[:] = list(days_by_date.values())
    strength_sessions[:] = list(strength_by_date.values())
    return warnings


async def weekly_planner_node(state: TrainingAnalysisState) -> dict[str, list | str]:
    logger.info("Starting weekly planner node")

    hitl_enabled = state.get("hitl_enabled", True)
    logger.info("Weekly planner node: HITL %s", "enabled" if hitl_enabled else "disabled")

    agent_start_time = datetime.now()

    tools = configure_node_tools(
        agent_name="weekly_planner",
        plot_storage=None,
        plotting_enabled=False,
    )

    num_days = len(state.get("week_dates") or []) or 28
    checkin_mode = state.get("checkin_mode", False)
    logger.info("Weekly planner node: check-in mode %s", "on" if checkin_mode else "off")

    supabase_user_id = os.environ.get("SUPABASE_USER_ID")
    if not supabase_user_id:
        raise ValueError("SUPABASE_USER_ID must be set to load strength session templates")
    strength_template_rows = get_strength_session_templates(supabase_user_id)
    strength_templates = build_strength_templates_context(supabase_user_id)
    next_strength_slot = get_next_strength_slot()
    training_paces = build_training_paces_context(state.get("garmin_data") or {})

    system_prompt = (
        get_workflow_context("weekly_planner")
        + WEEKLY_PLANNER_SYSTEM_PROMPT
        + (WEEKLY_PLANNER_CHECKIN_INSTRUCTIONS if checkin_mode else "")
        + (get_hitl_instructions("weekly_planner") if hitl_enabled else "")
        + WEEKLY_PLANNER_FINAL_CHECKLIST.format(num_days=num_days)
    )

    qa_messages = normalize_langchain_messages(state.get("weekly_planner_messages", []))
    user_message = {
        "role": "user",
        "content": WEEKLY_PLANNER_USER_PROMPT.format(
            num_days=num_days,
            season_plan=extract_agent_content(state.get("season_plan")),
            athlete_name=state["athlete_name"],
            current_date=json.dumps(state["current_date"], indent=2),
            week_dates=json.dumps(state["week_dates"], indent=2),
            competitions=json.dumps(state["competitions"], indent=2),
            planning_context=state["planning_context"],
            strength_templates=strength_templates,
            next_strength_slot=next_strength_slot,
            training_paces=training_paces,
            metrics_analysis=_safe_expert(state.get("metrics_outputs"), "for_weekly_planner"),
            activity_analysis=_safe_expert(state.get("activity_outputs"), "for_weekly_planner"),
            physiology_analysis=_safe_expert(state.get("physiology_outputs"), "for_weekly_planner"),
        ),
    }
    base_messages = [{"role": "system", "content": system_prompt}, user_message]

    base_llm = ModelSelector.get_llm(AgentRole.WORKOUT)
    llm_with_tools = base_llm.bind_tools(tools) if tools else base_llm
    llm_with_structure = llm_with_tools.with_structured_output(WeeklyPlanOutput)

    async def call_weekly_planning():
        messages_with_qa = base_messages + qa_messages
        if tools:
            return await handle_tool_calling_in_node(
                llm_with_tools=llm_with_structure,
                messages=messages_with_qa,
                tools=tools,
                max_iterations=15,
            )
        return await llm_with_structure.ainvoke(messages_with_qa)

    async def node_execution():
        agent_output: WeeklyPlanOutput = await retry_with_backoff(
            call_weekly_planning, AI_ANALYSIS_CONFIG, "Weekly Planning"
        )

        execution_time = (datetime.now() - agent_start_time).total_seconds()
        log_node_completion("Weekly planning", execution_time)

        strength_sessions = None
        if agent_output.strength_sessions:
            strength_sessions = [s.model_dump() for s in agent_output.strength_sessions]
            logger.info("Weekly planner produced %d strength session(s)", len(strength_sessions))

        scheduled_days = None
        if agent_output.scheduled_days:
            scheduled_days = [d.model_dump() for d in agent_output.scheduled_days]
            logger.info("Weekly planner produced %d scheduled day(s)", len(scheduled_days))

        coach_feedback = agent_output.coach_feedback
        # Run the auto-correcting fix first — it mutates scheduled_days/strength_sessions in
        # place, so the checks below see the corrected dates, not the LLM's raw (possibly
        # violating) ones.
        legs_warnings = _fix_legs_before_hard_runs(scheduled_days, strength_sessions, strength_template_rows)
        recurring_warnings = _check_recurring_requests_honored(
            scheduled_days, state.get("recurring_session_requests")
        )
        spacing_warnings = _check_strength_recovery_spacing(scheduled_days, strength_sessions, strength_template_rows)
        all_warnings = recurring_warnings + spacing_warnings + legs_warnings
        if all_warnings:
            logger.warning(
                "Post-generation checks: %d recurring-request miss(es), %d recovery-spacing issue(s), "
                "%d legs-before-hard-run issue(s)",
                len(recurring_warnings), len(spacing_warnings), len(legs_warnings),
            )
            warning_text = "\n".join(all_warnings)
            coach_feedback = f"{coach_feedback.rstrip()}\n\n{warning_text}" if coach_feedback else warning_text

        if coach_feedback:
            logger.info("Coach feedback: %s", coach_feedback[:120])
        logger.info("Schedule updated: %s", agent_output.schedule_updated)

        return {
            "weekly_plan": agent_output.model_dump(),
            "strength_sessions": strength_sessions,
            "scheduled_days": scheduled_days,
            "coach_feedback": coach_feedback,
            "schedule_updated": agent_output.schedule_updated,
            "costs": [create_cost_entry("weekly_planner", execution_time)],
        }

    return await execute_node_with_error_handling(
        node_name="Weekly planner",
        node_function=node_execution,
        error_message_prefix="Weekly planning failed",
    )
