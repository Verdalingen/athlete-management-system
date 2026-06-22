#!/usr/bin/env python3
"""Daily check-in CLI — cheap alternative to the full coach-cli pipeline.

Run every morning to get today's session briefing and have the plan auto-adjusted
for any missed sessions from yesterday.

Usage:
    pixi run coach-daily --config my_training_config.yaml
"""
import argparse
import asyncio
import getpass
import logging
import os
import sys
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from core.config import reload_config
from services.ai.ai_settings import ai_settings
from services.ai.langgraph.workflows.daily_checkin_workflow import run_daily_checkin
from services.ai.utils.plan_storage import FilePlanStorage
from services.garmin import ExtractionConfig, TriathlonCoachDataExtractor
from services.garmin.client import GarminConnectClient
from services.garmin.strength_uploader import delete_strength_workout, reschedule_workout

sys.path.append(str(Path(__file__).parent.parent))

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)


def _load_config(config_path: Path) -> dict:
    content = config_path.read_text(encoding="utf-8")
    return yaml.safe_load(content)


def _sync_garmin_workouts(
    old_scheduled_days: list[dict],
    new_scheduled_days: list[dict],
    workout_ids: dict[str, Any],
    email: str,
    password: str,
) -> dict[str, Any]:
    """Compare old vs new schedule and sync Garmin workouts accordingly.

    Handles three cases:
    - Strength session removed: delete workout from Garmin library.
    - Strength session moved to a new date: reschedule on Garmin calendar.
    - New strength session added: log a warning (exercises unknown, needs full run).

    Returns updated workout_ids dict.
    """
    old_strength = {d["date"] for d in old_scheduled_days if d.get("session_type") == "strength"}
    new_strength = {d["date"] for d in new_scheduled_days if d.get("session_type") == "strength"}

    removed = old_strength - new_strength
    added = new_strength - old_strength

    if not removed and not added:
        return workout_ids

    logger.info(
        "Garmin sync: %d strength session(s) removed, %d added",
        len(removed), len(added),
    )

    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client
    updated_ids = dict(workout_ids)

    try:
        # Simple reschedule: exactly one session moved to a new date
        if len(removed) == 1 and len(added) == 1:
            old_date = next(iter(removed))
            new_date = next(iter(added))
            entry = updated_ids.get(old_date)
            if entry:
                try:
                    new_schedule_id = reschedule_workout(client, entry, new_date)
                    updated_ids[new_date] = {**entry, "date": new_date, "schedule_id": new_schedule_id}
                    del updated_ids[old_date]
                    logger.info("✅ Rescheduled '%s' from %s → %s", entry.get("name"), old_date, new_date)
                except Exception:
                    logger.exception("❌ Failed to reschedule workout from %s to %s", old_date, new_date)
            else:
                logger.warning("No stored workoutId for %s — cannot reschedule", old_date)

        else:
            # Delete removed sessions
            for removed_date in removed:
                entry = updated_ids.get(removed_date)
                if entry:
                    try:
                        delete_strength_workout(client, entry["workout_id"])
                        del updated_ids[removed_date]
                        logger.info("✅ Deleted '%s' (was scheduled %s)", entry.get("name"), removed_date)
                    except Exception:
                        logger.exception("❌ Failed to delete workout for %s", removed_date)
                else:
                    logger.warning("No stored workoutId for %s — cannot delete", removed_date)

            # New sessions: cannot upload without exercise details
            if added:
                logger.warning(
                    "⚠️  %d new strength session(s) added to schedule (%s) — "
                    "run 'pixi run coach-cli' to upload them to Garmin.",
                    len(added), ", ".join(sorted(added)),
                )

    finally:
        gc.disconnect()

    return updated_ids


async def run_daily_from_config(config_path: Path) -> None:
    config = _load_config(config_path)

    athlete = config.get("athlete", {})
    athlete_name = athlete.get("name", "Athlete")
    email = athlete.get("email", "")
    if not email:
        raise ValueError("Athlete email is required in config file")

    extraction = config.get("extraction", {})
    ai_mode = extraction.get("ai_mode", "development")
    upload_to_garmin = extraction.get("upload_to_garmin", False)
    output_dir = Path(config.get("output", {}).get("directory", "./data"))
    output_dir.mkdir(parents=True, exist_ok=True)

    password = config.get("credentials", {}).get("password", "") or getpass.getpass(
        "Enter Garmin Connect password: "
    )

    os.environ["AI_MODE"] = ai_mode
    reload_config()
    ai_settings.reload()

    logger.info("Daily check-in for %s (AI mode: %s)", athlete_name, ai_mode)

    # Fetch only the last 2 days of activities — no metrics, no long-term trends
    logger.info("Fetching last 2 days of Garmin activities...")
    extractor = TriathlonCoachDataExtractor(email, password)
    garmin_data = extractor.extract_data(ExtractionConfig(
        activities_range=2,
        metrics_range=0,
        include_detailed_activities=False,
        include_metrics=False,
    ))

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    all_activities = asdict(garmin_data).get("activities", []) or []
    yesterday_activities = [
        a for a in all_activities if (a.get("start_time") or "").startswith(yesterday)
    ]

    logger.info(
        "Found %d total activities, %d from yesterday (%s)",
        len(all_activities), len(yesterday_activities), yesterday,
    )

    storage = FilePlanStorage(base_dir=str(output_dir / "storage"))

    # Snapshot schedule BEFORE the check-in so we can diff afterward
    old_scheduled_days: list[dict] = storage.load_json("cli_user", "scheduled_days") or []

    result = await run_daily_checkin(
        user_id="cli_user",
        athlete_name=athlete_name,
        yesterday_activities=yesterday_activities,
        storage=storage,
    )

    if error := result.get("error"):
        logger.error("❌ %s", error)
        sys.exit(1)

    # Sync Garmin workouts if the schedule changed and upload is enabled
    if upload_to_garmin and result.get("adjustments"):
        new_scheduled_days: list[dict] = storage.load_json("cli_user", "scheduled_days") or []
        workout_ids: dict[str, Any] = storage.load_json("cli_user", "garmin_workout_ids") or {}

        if old_scheduled_days and new_scheduled_days:
            updated_ids = _sync_garmin_workouts(
                old_scheduled_days, new_scheduled_days, workout_ids, email, password
            )
            if updated_ids != workout_ids:
                storage.save_json("cli_user", "garmin_workout_ids", updated_ids)
    elif result.get("adjustments") and not upload_to_garmin:
        logger.info(
            "Schedule adjusted but upload_to_garmin is disabled — "
            "Garmin workouts not synced."
        )

    # Save daily briefing
    briefing_path = output_dir / "daily_briefing.md"
    briefing_path.write_text(result["summary_markdown"], encoding="utf-8")

    # Print to terminal
    print("\n" + "=" * 60)
    print(f"  DAILY CHECK-IN — {date.today().strftime('%A, %B %d')}")
    print("=" * 60)
    print(f"\nYesterday: {result['yesterday_notes']} [{result['yesterday_status']}]")
    print(f"\nToday ({result['today_focus']}): {result['today_session']}")
    if result.get("adjustments"):
        print("\nSchedule adjustments:")
        for adj in result["adjustments"]:
            print(f"  • {adj}")
    print(f"\nFull briefing saved to: {briefing_path}")
    print(f"Time: {result.get('execution_time_seconds', 0):.1f}s\n")


def main():
    parser = argparse.ArgumentParser(
        description="Garmin AI Coach — Daily Check-In (cheap, fast)",
        epilog="Example: python daily_checkin_cli.py --config my_training_config.yaml",
    )
    parser.add_argument("--config", type=Path, required=True, help="Path to training config YAML")
    args = parser.parse_args()

    if not args.config.exists():
        logger.error("Config file not found: %s", args.config)
        sys.exit(1)

    try:
        asyncio.run(run_daily_from_config(args.config))
    except KeyboardInterrupt:
        logger.info("Cancelled by user")
    except Exception as e:
        logger.error("❌ Daily check-in failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
