"""Upload a test strength workout to Garmin Connect and verify it was accepted."""
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
    upload_strength_session,
)


def main() -> None:
    email = os.getenv("GARMIN_EMAIL") or input("Garmin email: ")
    password = os.getenv("GARMIN_PASSWORD", "")
    if not password:
        password = getpass.getpass("Garmin password: ")

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client

    # Matches Tue Jun 23 from the current weekly plan
    session = PlannedStrengthSession(
        name="[TEST] Strength A - Bench Focus",
        date="2026-06-23",
        exercises=[
            PlannedExercise(
                garmin_category="BENCH_PRESS",
                display_name="Bench Press",
                sets=[PlannedSet(reps=3)] * 5,
                rest_seconds=180,
            ),
            PlannedExercise(
                garmin_category="ROW",
                display_name="Row",
                sets=[PlannedSet(reps=8)] * 4,
                rest_seconds=120,
            ),
        ],
        estimated_duration_secs=2700,
    )

    print("Workout JSON to be uploaded:")
    print(json.dumps(build_strength_workout_json(session), indent=2))
    print()

    workout_id = upload_strength_session(client, session)
    print(f"\n✅ Success! workoutId={workout_id}")
    print("Check Garmin Connect → Workouts and your calendar for 2026-06-23.")

    # Fetch it back to see what Garmin stored
    stored = client.get_workout_by_id(workout_id)
    print("\nStored workout (from Garmin):")
    print(json.dumps(stored, indent=2))

    gc.disconnect()


if __name__ == "__main__":
    main()
