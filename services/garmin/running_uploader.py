"""Upload coach-planned running workouts to Garmin Connect for watch execution, and
deterministically render their structured segments into the same compact notation the coach
used to write by hand (e.g. "15min Z2 warm-up + 5x(1km Z5 @3:50-4:00/km, 2:30min jog r) + 10min
Z2 cool-down") for display.

Mirrors strength_uploader.py's shape and conventions. Builds raw workout-JSON dicts by hand
rather than using garminconnect's RunningWorkout/create_interval_step() convenience helpers,
because those only support time-based end conditions — interval reps here are frequently
distance-based (e.g. "400m Z5"), which the helpers don't expose.

KNOWN UNVERIFIED RISK: the exact JSON shape for a pace/speed target (workoutTargetTypeKey,
targetValueOne/targetValueTwo units and ordering) is a best-guess, not confirmed against a real
Garmin Connect payload — the installed garminconnect library's Pydantic models allow extra
fields but don't define target-value keys explicitly. Verify with one real push and fix here if
the API rejects it or silently drops the pace target.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from services.garmin.strength_uploader import _schedule_workout, delete_strength_workout

if TYPE_CHECKING:
    from garminconnect import Garmin

logger = logging.getLogger(__name__)

# Garmin sport type for running (sportTypeId 1 = running in the workout API)
_RUNNING_SPORT_TYPE = {
    "sportTypeId": 1,
    "sportTypeKey": "running",
    "displayOrder": 1,
}

_STEP_TYPES = {
    "warmup":   {"stepTypeId": 1, "stepTypeKey": "warmup", "displayOrder": 1},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown", "displayOrder": 2},
    "interval": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
    "recovery": {"stepTypeId": 4, "stepTypeKey": "recovery", "displayOrder": 4},
    # Garmin has no distinct "steady" step type — a continuous non-interval effort (a plain easy
    # or tempo run with no repeats) is just a single interval step.
    "steady":   {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
}

_DISTANCE_CONDITION = {"conditionTypeId": 1, "conditionTypeKey": "distance", "displayOrder": 1, "displayable": True}
_TIME_CONDITION = {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True}

_NO_TARGET = {
    "workoutTargetTypeId": 1,
    "workoutTargetTypeKey": "no.target",
    "displayOrder": 1,
}

_REPEAT_STEP_TYPE = {
    "stepTypeId": 6,
    "stepTypeKey": "repeat",
    "displayOrder": 6,
}

_ITERATIONS_CONDITION = {
    "conditionTypeId": 7,
    "conditionTypeKey": "iterations",
    "displayOrder": 7,
    "displayable": False,
}


@dataclass
class PlannedRunningSegment:
    segment_type: str                    # "warmup" | "interval" | "recovery" | "cooldown" | "steady"
    zone: str | None = None              # "Z1".."Z5"
    duration_secs: int | None = None     # set this OR distance_meters, not both
    distance_meters: int | None = None
    pace_low: str | None = None          # fast end, "M:SS" per km
    pace_high: str | None = None         # slow end, "M:SS" per km
    repeat_count: int = 1
    note: str | None = None


@dataclass
class PlannedRunningSession:
    name: str                    # Workout name shown in Garmin Connect
    date: str                    # YYYY-MM-DD, date to schedule on the watch calendar
    segments: list[PlannedRunningSegment] = field(default_factory=list)
    estimated_duration_secs: int = 1800


# ---------------------------------------------------------------------------
# Workout JSON builders
# ---------------------------------------------------------------------------

def _pace_to_mps(pace: str) -> float:
    """Convert 'M:SS' (minutes:seconds per km) into meters/second."""
    mins_str, secs_str = pace.split(":")
    total_secs = int(mins_str) * 60 + int(secs_str)
    return 1000.0 / total_secs


def _speed_target(pace_low: str, pace_high: str) -> dict:
    """pace_low is the fast end (lower time) -> higher speed; pace_high is the slow end -> lower
    speed. targetValueOne/Two ordering (low speed bound, high speed bound) is a best guess — see
    module docstring.
    """
    fast_mps = _pace_to_mps(pace_low)
    slow_mps = _pace_to_mps(pace_high)
    return {
        "workoutTargetTypeId": 4,
        "workoutTargetTypeKey": "pace.zone",
        "displayOrder": 4,
        "targetValueOne": round(slow_mps, 3),
        "targetValueTwo": round(fast_mps, 3),
    }


def _running_step(segment: PlannedRunningSegment, step_order: int) -> dict:
    step_type = _STEP_TYPES.get(segment.segment_type, _STEP_TYPES["interval"])
    step: dict = {
        "type": "ExecutableStepDTO",
        "stepOrder": step_order,
        "stepType": step_type,
    }
    if segment.distance_meters is not None:
        step["endCondition"] = _DISTANCE_CONDITION
        step["endConditionValue"] = float(segment.distance_meters)
    else:
        step["endCondition"] = _TIME_CONDITION
        step["endConditionValue"] = float(segment.duration_secs or 0)

    if segment.pace_low and segment.pace_high:
        step["targetType"] = _speed_target(segment.pace_low, segment.pace_high)
    else:
        step["targetType"] = _NO_TARGET
    return step


def build_running_workout_json(session: PlannedRunningSession) -> dict:
    """Convert a PlannedRunningSession into the JSON dict Garmin's API expects. Adjacent segments
    sharing the same repeat_count > 1 (e.g. an interval + its paired recovery, both "6x") are
    combined into a single RepeatGroupDTO, matching how strength_uploader.py groups active+rest
    steps for one exercise.
    """
    workout_steps: list[dict] = []
    step_order = 1
    i = 0
    segments = session.segments
    while i < len(segments):
        seg = segments[i]
        if seg.repeat_count > 1:
            group = [seg]
            j = i + 1
            while j < len(segments) and segments[j].repeat_count == seg.repeat_count:
                group.append(segments[j])
                j += 1
            inner_steps = [_running_step(s, k + 1) for k, s in enumerate(group)]
            workout_steps.append({
                "type": "RepeatGroupDTO",
                "stepOrder": step_order,
                "stepType": _REPEAT_STEP_TYPE,
                "numberOfIterations": seg.repeat_count,
                "endCondition": _ITERATIONS_CONDITION,
                "endConditionValue": float(seg.repeat_count),
                "smartRepeat": False,
                "workoutSteps": inner_steps,
            })
            i = j
        else:
            workout_steps.append(_running_step(seg, step_order))
            i += 1
        step_order += 1

    return {
        "workoutName": session.name,
        "sportType": _RUNNING_SPORT_TYPE,
        "estimatedDurationInSecs": session.estimated_duration_secs,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": _RUNNING_SPORT_TYPE,
                "workoutSteps": workout_steps,
            }
        ],
    }


# ---------------------------------------------------------------------------
# Upload + schedule
# ---------------------------------------------------------------------------

def upload_running_session(client: Garmin, session: PlannedRunningSession) -> dict:
    """Upload a running workout and schedule it. Returns {workout_id, schedule_id, name, date}."""
    workout_json = build_running_workout_json(session)
    logger.info("Uploading running workout JSON for '%s':\n%s", session.name, json.dumps(workout_json, indent=2))

    try:
        response = client.upload_workout(workout_json)
    except Exception as exc:
        http_err = getattr(exc, "error", None)
        if http_err is not None:
            resp = getattr(http_err, "response", None)
            if resp is not None:
                logger.error(
                    "Garmin API rejected running workout '%s' — HTTP %s: %s",
                    session.name, resp.status_code, resp.text,
                )
        raise

    workout_id = response.get("workoutId") or response.get("workout_id")
    if not workout_id:
        raise RuntimeError(f"Upload succeeded but no workoutId in response: {response}")

    logger.info("Uploaded running workout '%s' → workoutId=%s", session.name, workout_id)

    schedule_id = _schedule_workout(client, int(workout_id), session.date)
    return {
        "workout_id": int(workout_id),
        "schedule_id": schedule_id,
        "name": session.name,
        "date": session.date,
    }


def delete_running_workout(client: Garmin, workout_id: int) -> None:
    """Permanently delete a running workout from the Garmin library. Deleting a workout removes
    all of its scheduled dates too, so no separate unschedule step is needed.
    """
    delete_strength_workout(client, workout_id)


_FALLBACK_JOG_PACE_SECS_PER_KM = 330  # 5:30/km — same fallback estimate_running_duration_secs() uses


def normalize_recovery_segments(segments: list[dict]) -> None:
    """Force any non-interval segment (recovery/warmup/cooldown/steady) that came back
    distance-based into time-based, in place.

    The schema instructs the LLM to use duration_secs for everything except the interval
    rep itself — distance only belongs on the work interval, not the jog between reps —
    but that guidance isn't always followed (confirmed live: a 'jog recovery' segment came
    back as distance_meters=200 with pace_low/pace_high both null). Rather than keep
    tightening prompt wording and hoping, this makes the rule actually hold regardless of
    what the LLM emits: converts using the segment's own pace range if it has one, else the
    same flat fallback pace estimate_running_duration_secs() uses. Call this before
    render_running_description() so the rendered notation (and everything downstream that
    reads it — Garmin upload, duration estimates) reflects the correction.
    """
    for seg in segments:
        if seg.get("segment_type") == "interval" or seg.get("distance_meters") is None:
            continue
        lo, hi = seg.get("pace_low"), seg.get("pace_high")
        pace_secs_per_km = None
        if lo and hi:
            lo_secs = int(lo.split(":")[0]) * 60 + int(lo.split(":")[1])
            hi_secs = int(hi.split(":")[0]) * 60 + int(hi.split(":")[1])
            pace_secs_per_km = (lo_secs + hi_secs) / 2
        pace_secs_per_km = pace_secs_per_km or _FALLBACK_JOG_PACE_SECS_PER_KM
        seg["duration_secs"] = round((seg["distance_meters"] / 1000.0) * pace_secs_per_km)
        seg["distance_meters"] = None


def estimate_running_duration_secs(segments: list[dict]) -> int:
    """Best-effort total duration for a session's segments, for the workout's informational
    estimatedDurationInSecs field only (not used for watch behavior — each step's own
    endCondition is what actually governs execution). Distance-based segments are estimated from
    the midpoint of their pace range, falling back to a flat 5:30/km guess when no pace is set.
    """
    total = 0.0
    for seg in segments:
        rc = seg.get("repeat_count", 1)
        if seg.get("duration_secs") is not None:
            total += seg["duration_secs"] * rc
        elif seg.get("distance_meters") is not None:
            lo, hi = seg.get("pace_low"), seg.get("pace_high")
            pace_secs_per_km = None
            if lo and hi:
                lo_secs = int(lo.split(":")[0]) * 60 + int(lo.split(":")[1])
                hi_secs = int(hi.split(":")[0]) * 60 + int(hi.split(":")[1])
                pace_secs_per_km = (lo_secs + hi_secs) / 2
            pace_secs_per_km = pace_secs_per_km or 330  # 5:30/km fallback
            total += (seg["distance_meters"] / 1000.0) * pace_secs_per_km * rc
    return round(total)


# ---------------------------------------------------------------------------
# Description rendering (structured segments -> display notation)
# ---------------------------------------------------------------------------

def _format_duration_or_distance(seg: dict) -> str:
    if seg.get("distance_meters") is not None:
        m = seg["distance_meters"]
        return f"{m / 1000:g}km" if m >= 1000 and m % 1000 == 0 else f"{m}m"
    secs = seg.get("duration_secs") or 0
    if secs % 60 == 0:
        return f"{secs // 60}min"
    return f"{secs // 60}:{secs % 60:02d}min"


def _format_pace_suffix(seg: dict) -> str:
    lo, hi = seg.get("pace_low"), seg.get("pace_high")
    if not lo or not hi:
        return ""
    if lo == hi:
        return f" @{lo}/km"
    return f" @{lo}-{hi}/km"


_TYPE_LABEL = {
    "en": {"warmup": "warm-up", "cooldown": "cool-down", "steady": "continuous"},
    "no": {"warmup": "oppvarming", "cooldown": "nedtrapping", "steady": "kontinuerlig"},
}
_JOG_NOTE = {"en": "jog", "no": "jogg"}
_RECOVERY_SUFFIX = {"en": "r", "no": "hvile"}


def render_running_description(segments: list[dict], language: str = "en") -> str:
    """Deterministically render a running session's structured segments into the same compact
    notation the coach used to author by hand (e.g. "15min Z2 warm-up + 5x(1km Z5
    @3:50-4:00/km, 2:30min jog r) + 10min Z2 cool-down"), so existing display code
    (web/lib/workout-structure.tsx, web/lib/duration.ts) keeps working unchanged. segments is a
    list of plain dicts (RunningSegment.model_dump() shape), not dataclass instances, since this
    runs on raw AI-output / Supabase JSONB data.
    """
    if not segments:
        return ""

    type_label = _TYPE_LABEL.get(language, _TYPE_LABEL["en"])
    jog_note = _JOG_NOTE.get(language, _JOG_NOTE["en"])
    recovery_suffix = _RECOVERY_SUFFIX.get(language, _RECOVERY_SUFFIX["en"])

    parts: list[str] = []
    i = 0
    while i < len(segments):
        seg = segments[i]
        rc = seg.get("repeat_count", 1)
        if rc > 1:
            group = [seg]
            j = i + 1
            while j < len(segments) and segments[j].get("repeat_count", 1) == rc:
                group.append(segments[j])
                j += 1
            if len(group) == 1:
                s = group[0]
                zone = f" {s['zone']}" if s.get("zone") else ""
                note = f" {s['note']}" if s.get("note") else ""
                parts.append(f"{rc}x{_format_duration_or_distance(s)}{zone}{note}{_format_pace_suffix(s)}")
            else:
                main, rest = group[0], group[1:]
                zone = f" {main['zone']}" if main.get("zone") else ""
                inner = [f"{_format_duration_or_distance(main)}{zone}{_format_pace_suffix(main)}"]
                for r in rest:
                    note = r.get("note") or jog_note
                    inner.append(f"{_format_duration_or_distance(r)} {note} {recovery_suffix}")
                parts.append(f"{rc}x({', '.join(inner)})")
            i = j
        else:
            zone = f" {seg['zone']}" if seg.get("zone") else ""
            label = type_label.get(seg.get("segment_type") or "", "")
            label_suffix = f" {label}" if label else ""
            note = f" {seg['note']}" if seg.get("note") and not label else ""
            parts.append(f"{_format_duration_or_distance(seg)}{zone}{label_suffix}{note}{_format_pace_suffix(seg)}")
            i += 1

    return " + ".join(parts)
