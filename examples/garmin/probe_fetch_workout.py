"""Upload a minimal test workout then fetch it back — reveals the exerciseName field structure."""
import getpass
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv
load_dotenv()

from services.garmin.client import GarminConnectClient
from services.garmin.strength_uploader import delete_strength_workout


def main() -> None:
    email = os.getenv("GARMIN_EMAIL", "adrianwalderhaugjohnsen@gmail.com")
    password = os.getenv("GARMIN_PASSWORD", "")
    if not password:
        password = getpass.getpass("Garmin password: ")

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client

    from services.garmin.strength_uploader import (
        PlannedExercise, PlannedSet, PlannedStrengthSession, build_strength_workout_json,
    )

    session = PlannedStrengthSession(
        name="[PROBE] Delete me",
        date="2026-06-24",
        exercises=[
            PlannedExercise(
                garmin_category="BENCH_PRESS",
                display_name="Barbell Bench Press",
                sets=[PlannedSet(reps=5, weight_kg=100.0)] * 3,
            ),
        ],
        estimated_duration_secs=1800,
    )

    workout_json = build_strength_workout_json(session)
    active_step = workout_json["workoutSegments"][0]["workoutSteps"][0]["workoutSteps"][0]
    print("Upload JSON active step:", json.dumps(active_step, indent=2))

    response = client.upload_workout(workout_json)
    workout_id = response.get("workoutId") or response.get("workout_id")
    print(f"\nUploaded → workoutId={workout_id}")

    stored = client.get_workout_by_id(workout_id)
    step = stored["workoutSegments"][0]["workoutSteps"][0]["workoutSteps"][0]
    print(f"\nweightValue stored: {step.get('weightValue')!r}")
    print(f"weightUnit stored:  {step.get('weightUnit')!r}")
    print(f"exerciseName field: {step.get('exerciseName')!r}")

    delete_strength_workout(client, int(workout_id))
    print(f"\nDeleted workoutId={workout_id}")

    gc.disconnect()


if __name__ == "__main__":
    main()

