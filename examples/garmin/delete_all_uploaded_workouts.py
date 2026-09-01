"""Delete all workouts recorded in garmin_workout_ids.json and clear the file."""
import getpass
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv

load_dotenv()

from services.garmin.client import GarminConnectClient
from services.garmin.strength_uploader import delete_strength_workout

IDS_FILE = os.path.join(os.path.dirname(__file__), "../../data/storage/cli_user/garmin_workout_ids.json")


def main() -> None:
    with open(IDS_FILE) as f:
        entries: dict = json.load(f)

    if not entries:
        print("Nothing to delete.")
        return

    print(f"Will delete {len(entries)} workout(s):")
    for date, entry in sorted(entries.items()):
        print(f"  {date}  {entry['name']}  (id={entry['workout_id']})")

    print()
    confirm = input("Proceed? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    email = os.getenv("GARMIN_EMAIL", "adrianwalderhaugjohnsen@gmail.com")
    password = os.getenv("GARMIN_PASSWORD", "")
    if not password:
        password = getpass.getpass("Garmin password: ")

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client

    failed = []
    for date, entry in sorted(entries.items()):
        wid = entry["workout_id"]
        try:
            delete_strength_workout(client, wid)
            print(f"  Deleted {date} workoutId={wid}")
        except Exception as exc:
            print(f"  FAILED {date} workoutId={wid}: {exc}")
            failed.append(date)

    gc.disconnect()

    # Clear the JSON file (keep only entries that failed to delete)
    remaining = {d: e for d, e in entries.items() if d in failed}
    with open(IDS_FILE, "w") as f:
        json.dump(remaining, f, indent=2)

    if remaining:
        print(f"\n{len(remaining)} workout(s) could not be deleted — kept in JSON.")
    else:
        print("\nAll workouts deleted. garmin_workout_ids.json cleared.")


if __name__ == "__main__":
    main()
