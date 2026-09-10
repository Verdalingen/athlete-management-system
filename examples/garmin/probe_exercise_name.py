"""Upload a minimal workout with exerciseName set, fetch it back, verify, then delete."""
import getpass
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv

load_dotenv()

from services.garmin.client import GarminConnectClient
from services.garmin.strength_uploader import (
    PlannedExercise,
    PlannedSet,
    PlannedStrengthSession,
    build_strength_workout_json,
    delete_strength_workout,
)

PROBE_SESSION = PlannedStrengthSession(
    name="PROBE exerciseName test",
    date="2099-01-01",
    exercises=[
        PlannedExercise(
            garmin_category="BENCH_PRESS",
            display_name="Barbell Bench Press",
            sets=[PlannedSet(reps=5)],
        ),
        PlannedExercise(
            garmin_category="ROW",
            display_name="DB Chest-Supported Row",
            sets=[PlannedSet(reps=10)],
        ),
        PlannedExercise(
            garmin_category="LATERAL_RAISE",
            display_name="DB Lateral Raise",
            sets=[PlannedSet(reps=15)],
        ),
    ],
)


def main() -> None:
    email = os.getenv("GARMIN_EMAIL") or input("Garmin email: ")
    password = os.getenv("GARMIN_PASSWORD", "")
    if not password:
        password = getpass.getpass("Garmin password: ")

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client

    workout_json = build_strength_workout_json(PROBE_SESSION)
    print("Uploading workout JSON:")
    print(json.dumps(workout_json, indent=2))
    print()

    try:
        response = client.upload_workout(workout_json)
    except Exception as exc:
        print(f"Upload FAILED: {exc}")
        http_err = getattr(exc, "error", None)
        if http_err is not None:
            resp = getattr(http_err, "response", None)
            if resp is not None:
                print(f"HTTP {resp.status_code}: {resp.text}")
        gc.disconnect()
        return

    workout_id = response.get("workoutId") or response.get("workout_id")
    print(f"Uploaded workoutId={workout_id}")

    stored = client.get_workout_by_id(workout_id)
    print("\nStored exerciseName values (full step JSON):")
    for segment in stored.get("workoutSegments", []):
        for step in segment.get("workoutSteps", []):
            inner_steps = step.get("workoutSteps", [step])
            for inner in inner_steps:
                cat = inner.get("category")
                if not cat:
                    continue
                print(json.dumps(inner, indent=2))

    print(f"\nDeleting workoutId={workout_id}...")
    delete_strength_workout(client, workout_id)
    print("Done.")
    gc.disconnect()


if __name__ == "__main__":
    main()
