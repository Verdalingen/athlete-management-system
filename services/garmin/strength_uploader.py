"""Upload coach-planned strength workouts to Garmin Connect for watch execution."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from garminconnect import Garmin

logger = logging.getLogger(__name__)

# Maps AI-generated exercise names that aren't valid Garmin category keys to their
# closest base category. The Garmin API only accepts top-level category names.
_CATEGORY_FALLBACK: dict[str, str] = {
    "INCLINE_BENCH_PRESS": "BENCH_PRESS",
    "DECLINE_BENCH_PRESS": "BENCH_PRESS",
    "BARBELL_ROW": "ROW",
    "SEATED_CABLE_ROW": "ROW",
    "CABLE_ROW": "ROW",
    "ROMANIAN_DEADLIFT": "DEADLIFT",
    "STIFF_LEG_DEADLIFT": "DEADLIFT",
    "SUMO_DEADLIFT": "DEADLIFT",
    "FRONT_SQUAT": "SQUAT",
    "GOBLET_SQUAT": "SQUAT",
    "HACK_SQUAT": "SQUAT",
    "BULGARIAN_SPLIT_SQUAT": "LUNGE",
    "SPLIT_SQUAT": "LUNGE",
    "REVERSE_LUNGE": "LUNGE",
    "WALKING_LUNGE": "LUNGE",
    "OVERHEAD_PRESS": "SHOULDER_PRESS",
    "MILITARY_PRESS": "SHOULDER_PRESS",
    "LAT_PULLDOWN": "PULL_UP",
    "ASSISTED_PULL_UP": "PULL_UP",
    "HAMMER_CURL": "CURL",
    "PREACHER_CURL": "CURL",
    "TRICEPS_PUSHDOWN": "TRICEPS_EXTENSION",
    "OVERHEAD_TRICEPS_EXTENSION": "TRICEPS_EXTENSION",
    "SKULLCRUSHER": "TRICEPS_EXTENSION",
    "LATERAL_RAISE": "SHOULDER_PRESS",
    "FRONT_RAISE": "SHOULDER_PRESS",
    "FACE_PULL": "ROW",
    "CABLE_FACE_PULL": "ROW",
    "HIP_THRUST": "DEADLIFT",
    "GLUTE_BRIDGE": "DEADLIFT",
    "CHEST_FLY": "BENCH_PRESS",
    "CABLE_FLY": "BENCH_PRESS",
    "INCLINE_CURL": "CURL",
    "CONCENTRATION_CURL": "CURL",
}

# Garmin sport type for strength / gym activities
_STRENGTH_SPORT_TYPE = {
    "sportTypeId": 6,
    "sportTypeKey": "fitness_equipment",
    "displayOrder": 6,
}

_NO_TARGET = {
    "workoutTargetTypeId": 1,
    "workoutTargetTypeKey": "no.target",
    "displayOrder": 1,
}

_INTERVAL_STEP_TYPE = {
    "stepTypeId": 3,
    "stepTypeKey": "interval",
    "displayOrder": 3,
}

_REST_STEP_TYPE = {
    "stepTypeId": 5,
    "stepTypeKey": "rest",
    "displayOrder": 5,
}

_REPEAT_STEP_TYPE = {
    "stepTypeId": 6,
    "stepTypeKey": "repeat",
    "displayOrder": 6,
}

_LAP_BUTTON_CONDITION = {
    "conditionTypeId": 1,
    "conditionTypeKey": "lap.button",
    "displayOrder": 1,
    "displayable": True,
}

# Used only on RepeatGroupDTO to tell Garmin how many sets to loop through.
# Individual set/rest steps use _LAP_BUTTON_CONDITION for manual athlete control.
_ITERATIONS_CONDITION = {
    "conditionTypeId": 7,
    "conditionTypeKey": "iterations",
    "displayOrder": 7,
    "displayable": False,
}


@dataclass
class PlannedSet:
    reps: int
    weight_kg: float | None = None  # None → athlete selects weight on watch


@dataclass
class PlannedExercise:
    garmin_category: str         # Garmin category key, e.g. "BENCH_PRESS"
    display_name: str            # Human-readable name used in the workout title
    sets: list[PlannedSet] = field(default_factory=list)
    rest_seconds: int = 180      # Rest between sets (informational; watch uses lap-button)


@dataclass
class PlannedStrengthSession:
    name: str                    # Workout name shown in Garmin Connect
    date: str                    # YYYY-MM-DD, date to schedule on the watch calendar
    exercises: list[PlannedExercise] = field(default_factory=list)
    estimated_duration_secs: int = 3600


# ---------------------------------------------------------------------------
# Workout JSON builders
# ---------------------------------------------------------------------------

def _active_step(garmin_category: str, weight_kg: float | None, step_order: int) -> dict:
    normalized = _CATEGORY_FALLBACK.get(garmin_category, garmin_category)
    if normalized != garmin_category:
        logger.debug("Normalized category %s → %s", garmin_category, normalized)
    step: dict = {
        "type": "ExecutableStepDTO",
        "stepOrder": step_order,
        "stepType": _INTERVAL_STEP_TYPE,
        "endCondition": _LAP_BUTTON_CONDITION,
        "targetType": _NO_TARGET,
        "category": normalized,
    }
    return step


def _rest_step(step_order: int) -> dict:
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": step_order,
        "stepType": _REST_STEP_TYPE,
        "endCondition": _LAP_BUTTON_CONDITION,
        "targetType": _NO_TARGET,
    }


def _exercise_group(exercise: PlannedExercise, group_order: int) -> dict:
    """Build a RepeatGroup for one exercise (N sets of reps + rest)."""
    if not exercise.sets:
        return {}

    # Build inner steps: one active step + one rest step per set
    # We use a RepeatGroup only when all sets are identical; otherwise flatten.
    unique_sets = {(s.reps, s.weight_kg) for s in exercise.sets}
    use_repeat_group = len(unique_sets) == 1
    n_sets = len(exercise.sets)
    s0 = exercise.sets[0]

    if use_repeat_group:
        inner_steps = [
            _active_step(exercise.garmin_category, s0.weight_kg, 1),
            _rest_step(2),
        ]
        return {
            "type": "RepeatGroupDTO",
            "stepOrder": group_order,
            "stepType": _REPEAT_STEP_TYPE,
            "numberOfIterations": n_sets,
            "endCondition": _ITERATIONS_CONDITION,
            "endConditionValue": float(n_sets),
            "smartRepeat": False,
            "skipLastRestStep": True,
            "workoutSteps": inner_steps,
        }

    # Varying sets — flatten into individual steps
    steps = []
    for i, s in enumerate(exercise.sets, start=1):
        steps.append(_active_step(exercise.garmin_category, s.weight_kg, i * 2 - 1))
        steps.append(_rest_step(i * 2))
    return {
        "type": "RepeatGroupDTO",
        "stepOrder": group_order,
        "stepType": _REPEAT_STEP_TYPE,
        "numberOfIterations": 1,
        "endCondition": _ITERATIONS_CONDITION,
        "endConditionValue": 1.0,
        "smartRepeat": False,
        "skipLastRestStep": True,
        "workoutSteps": steps,
    }


def build_strength_workout_json(session: PlannedStrengthSession) -> dict:
    """Convert a PlannedStrengthSession into the JSON dict Garmin's API expects."""
    workout_steps = []
    for i, exercise in enumerate(session.exercises, start=1):
        group = _exercise_group(exercise, group_order=i)
        if group:
            workout_steps.append(group)

    return {
        "workoutName": session.name,
        "sportType": _STRENGTH_SPORT_TYPE,
        "estimatedDurationInSecs": session.estimated_duration_secs,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": _STRENGTH_SPORT_TYPE,
                "workoutSteps": workout_steps,
            }
        ],
    }


# ---------------------------------------------------------------------------
# Upload + schedule
# ---------------------------------------------------------------------------

def upload_strength_session(client: Garmin, session: PlannedStrengthSession) -> dict:
    """Upload a strength workout and schedule it. Returns {workout_id, schedule_id, name, date}."""
    workout_json = build_strength_workout_json(session)
    logger.info("Uploading workout JSON for '%s':\n%s", session.name, json.dumps(workout_json, indent=2))

    try:
        response = client.upload_workout(workout_json)
    except Exception as exc:
        # Log the Garmin API error response body for debugging
        http_err = getattr(exc, "error", None)
        if http_err is not None:
            resp = getattr(http_err, "response", None)
            if resp is not None:
                logger.error(
                    "Garmin API rejected workout '%s' — HTTP %s: %s",
                    session.name, resp.status_code, resp.text,
                )
        raise

    workout_id = response.get("workoutId") or response.get("workout_id")
    if not workout_id:
        raise RuntimeError(f"Upload succeeded but no workoutId in response: {response}")

    logger.info("Uploaded workout '%s' → workoutId=%s", session.name, workout_id)

    schedule_id = _schedule_workout(client, int(workout_id), session.date)
    return {
        "workout_id": int(workout_id),
        "schedule_id": schedule_id,
        "name": session.name,
        "date": session.date,
    }


def _schedule_workout(client: Garmin, workout_id: int, date: str) -> int | None:
    """Schedule an uploaded workout to a specific calendar date. Returns schedule_id."""
    schedule_url = f"{client.garmin_workouts_schedule_url}/{workout_id}"
    response = client.garth.post("connectapi", schedule_url, json={"date": date}, api=True)
    schedule_id = None
    if isinstance(response, dict):
        schedule_id = response.get("scheduleId") or response.get("schedule_id")
    logger.info("Scheduled workoutId=%s on %s (scheduleId=%s)", workout_id, date, schedule_id)
    return int(schedule_id) if schedule_id else None


def delete_strength_workout(client: Garmin, workout_id: int) -> None:
    """Permanently delete a workout from the Garmin library (removes all scheduled dates too)."""
    url = f"/workout-service/workout/{workout_id}"
    client.garth.request("DELETE", "connectapi", url, api=True)
    logger.info("Deleted workoutId=%s from Garmin library", workout_id)


def unschedule_workout(client: Garmin, schedule_id: int) -> None:
    """Remove a workout from a specific calendar date using its schedule_id."""
    url = f"/workout-service/schedule/{schedule_id}"
    client.garth.request("DELETE", "connectapi", url, api=True)
    logger.info("Unscheduled scheduleId=%s", schedule_id)


def reschedule_workout(client: Garmin, entry: dict, new_date: str) -> int | None:
    """Move a scheduled workout to a new date. entry is a garmin_workout_ids dict value.
    Returns new schedule_id, or None if rescheduling failed."""
    workout_id = entry["workout_id"]
    schedule_id = entry.get("schedule_id")

    if schedule_id:
        try:
            unschedule_workout(client, schedule_id)
        except Exception:
            logger.warning("Could not unschedule scheduleId=%s — proceeding with re-schedule", schedule_id)

    new_schedule_id = _schedule_workout(client, workout_id, new_date)
    logger.info("Rescheduled workoutId=%s to %s", workout_id, new_date)
    return new_schedule_id


