"""Probe Garmin API for the raw exercise sets response on a recent strength session."""
import json
import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from services.garmin.client import GarminConnectClient


def main() -> None:
    email = os.getenv("GARMIN_EMAIL") or input("Garmin email: ")
    password = os.getenv("GARMIN_PASSWORD", "")
    if not password:
        import getpass
        password = getpass.getpass("Garmin password: ")

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client

    end = date.today()
    start = end - timedelta(days=21)
    activities = client.get_activities_by_date(start.isoformat(), end.isoformat()) or []

    strength_types = {"strength_training", "fitness_equipment", "indoor_cardio"}
    strength_activities = [
        a for a in activities
        if (a.get("activityType", {}) or {}).get("typeKey", "").lower() in strength_types
    ]

    if not strength_activities:
        print("No strength activities found in the last 21 days.")
        return

    print(f"Found {len(strength_activities)} strength activity/activities.")
    activity = strength_activities[0]
    activity_id = activity.get("activityId")
    print(f"\nUsing activity: {activity.get('activityName')} (id={activity_id})")

    print("\n--- exerciseSets response ---")
    exercise_sets = client.get_activity_exercise_sets(activity_id)
    print(json.dumps(exercise_sets, indent=2, default=str))

    print("\n--- lapDTOs response (first 3) ---")
    splits = client.get_activity_splits(activity_id) or {}
    laps = splits.get("lapDTOs") or splits.get("laps") or []
    print(json.dumps(laps[:3], indent=2, default=str))


if __name__ == "__main__":
    main()
