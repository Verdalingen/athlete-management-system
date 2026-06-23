"""Fetch a manually-created Garmin workout to extract exerciseName IDs."""
import getpass
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv
load_dotenv()

from services.garmin.client import GarminConnectClient


def main() -> None:
    email = os.getenv("GARMIN_EMAIL", "adrianwalderhaugjohnsen@gmail.com")
    password = os.getenv("GARMIN_PASSWORD", "")
    if not password:
        password = getpass.getpass("Garmin password: ")

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client

    workouts = client.get_workouts(start=0, limit=50)
    print("Workouts in library:")
    for w in workouts:
        print(f"  {w['workoutId']}  {w['workoutName']}")

    # Find the manually-created probe workout
    target = next((w for w in workouts if "PROBE" in w["workoutName"].upper()), None)
    if target is None:
        print("\nNo 'PROBE' workout found — create one manually in Garmin Connect first.")
        gc.disconnect()
        return
    print(f"\nFetching: {target['workoutName']} (id={target['workoutId']})\n")
    stored = client.get_workout_by_id(target["workoutId"])

    print(f"{'Exercise':<35} {'category':<20} {'exerciseName'}")
    print("-" * 80)
    for segment in stored.get("workoutSegments", []):
        for step in segment.get("workoutSteps", []):
            for inner in step.get("workoutSteps", [step]):
                cat = inner.get("category")
                if not cat:
                    continue
                en = inner.get("exerciseName")
                print(f"{str(en):<35} {cat:<20} {json.dumps(en)}")

    gc.disconnect()


if __name__ == "__main__":
    main()
