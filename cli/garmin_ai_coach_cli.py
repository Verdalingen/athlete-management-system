#!/usr/bin/env python3

import argparse
import asyncio
import getpass
import json
import logging
import os
import sys
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

from core.config import reload_config
from services.ai.ai_settings import ai_settings
from services.ai.langgraph.workflows.planning_workflow import (
    run_complete_analysis_and_planning,
    run_replan,
)
from services.ai.utils.plan_storage import FilePlanStorage
from services.garmin import ExtractionConfig, TriathlonCoachDataExtractor
from services.garmin.client import GarminConnectClient
from services.garmin.strength_uploader import PlannedExercise, PlannedSet, PlannedStrengthSession, delete_strength_workout, upload_strength_session
from services.outside.client import OutsideApiGraphQlClient
from services.supabase.plan_writer import write_plan, write_report

sys.path.append(str(Path(__file__).parent.parent))


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)


class ConfigParser:

    def __init__(self, config_path: Path):
        self.config_path = config_path
        self.config = self._load_config()

    def _load_config(self) -> dict[str, Any]:
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        content = self.config_path.read_text(encoding="utf-8")

        if self.config_path.suffix in [".yaml", ".yml"]:
            return yaml.safe_load(content)
        elif self.config_path.suffix == ".json":
            return json.loads(content)
        else:
            raise ValueError(f"Unsupported config format: {self.config_path.suffix}")

    def get_athlete_info(self) -> tuple[str, str]:
        if not (email := self.config.get("athlete", {}).get("email")):
            raise ValueError("Athlete email is required in config file")

        return self.config.get("athlete", {}).get("name", "Athlete"), email

    def get_contexts(self) -> tuple[str, str]:
        return (
            self.config.get("context", {}).get("analysis", "").strip(),
            self.config.get("context", {}).get("planning", "").strip()
        )

    def get_extraction_config(self) -> dict[str, Any]:
        extraction = self.config.get("extraction", {})
        return {
            "activities_days": extraction.get("activities_days", 7),
            "metrics_days": extraction.get("metrics_days", 14),
            "ai_mode": extraction.get("ai_mode", "development"),
            "enable_plotting": extraction.get("enable_plotting", False),
            "hitl_enabled": extraction.get("hitl_enabled", True),
            "skip_synthesis": extraction.get("skip_synthesis", False),
            "upload_to_garmin": extraction.get("upload_to_garmin", False),
        }

    def get_competitions(self) -> list[dict[str, Any]]:
        competitions = self.config.get("competitions", [])
        return [
            {
                "name": comp.get("name", ""),
                "date": comp.get("date", ""),
                "race_type": comp.get("race_type", ""),
                "priority": comp.get("priority", "B"),
                "target_time": comp.get("target_time", ""),
            }
            for comp in competitions
        ]

    def get_output_directory(self) -> Path:
        return Path(self.config.get("output", {}).get("directory", "./data"))

    def get_password(self) -> str:
        return (
            self.config.get("credentials", {}).get("password", "") or
            getpass.getpass("Enter Garmin Connect password: ")
        )


def fetch_outside_competitions_from_config(config: dict[str, Any]) -> list[dict[str, Any]]:
    client = OutsideApiGraphQlClient()

    if isinstance(outside_cfg := config.get("outside"), dict) and any(
        isinstance(value, list) for value in outside_cfg.values()
    ):
        return client.get_competitions(outside_cfg)

    aggregate: list[dict[str, Any]] = []

    if isinstance(legacy_bikereg := config.get("bikereg", []), list) and legacy_bikereg:
        aggregate.extend(client.get_competitions(legacy_bikereg))

    if legacy_all := {
        key: entries
        for key in ("runreg", "trireg", "skireg")
        if isinstance(entries := config.get(key, []), list) and entries
    }:
        aggregate.extend(client.get_competitions(legacy_all))

    return aggregate


def _save_html_outputs(output_dir: Path, result: dict[str, Any]) -> list[str]:
    files_generated: list[str] = []

    for filename, key in [
        ("analysis.html", "analysis_html"),
        ("planning.html", "planning_html"),
    ]:
        if content := result.get(key):
            if isinstance(content, dict):
                content = content.get("content", "")

            output_path = output_dir / filename
            output_path.write_text(content, encoding="utf-8")
            files_generated.append(filename)
            logger.info("Saved: %s", output_path)

    return files_generated


def _save_expert_outputs(output_dir: Path, result: dict[str, Any]) -> list[str]:
    files_generated: list[str] = []

    for filename, key in [
        ("metrics_expert.json", "metrics_outputs"),
        ("activity_expert.json", "activity_outputs"),
        ("physiology_expert.json", "physiology_outputs"),
    ]:
        if output := result.get(key):
            output_path = output_dir / filename
            output_path.write_text(
                json.dumps(output.model_dump(mode="json"), indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            files_generated.append(filename)
            logger.info("Saved: %s", output_path)

    return files_generated


def _save_plan_outputs(output_dir: Path, result: dict[str, Any]) -> list[str]:
    files_generated: list[str] = []

    storage = FilePlanStorage()
    user_id = result.get("user_id", "cli_user")

    for filename, key in [
        ("season_plan.md", "season_plan"),
        ("weekly_plan.md", "weekly_plan"),
    ]:
        if plan_dict := result.get(key):
            output = plan_dict.get("output", plan_dict) if isinstance(plan_dict, dict) else plan_dict
            if isinstance(output, str):
                output_path = output_dir / filename
                output_path.write_text(output, encoding="utf-8")
                files_generated.append(filename)
                logger.info("Saved: %s", output_path)
                storage.save_plan(user_id, key, output)

    if scheduled_days := result.get("scheduled_days"):
        storage.save_json(user_id, "scheduled_days", scheduled_days)
        logger.info("Saved scheduled_days (%d days) to storage", len(scheduled_days))

    return files_generated


async def run_analysis_from_config(config_path: Path) -> None:
    config_parser = ConfigParser(config_path)
    athlete_name, email = config_parser.get_athlete_info()
    analysis_context, planning_context = config_parser.get_contexts()
    extraction_settings = config_parser.get_extraction_config()

    competitions = config_parser.get_competitions()
    outside_competitions = fetch_outside_competitions_from_config(config_parser.config)
    if outside_competitions:
        competitions.extend(outside_competitions)

    output_dir = config_parser.get_output_directory()

    logger.info("Starting analysis for %s", athlete_name)
    logger.info("Output directory: %s", output_dir)

    password = config_parser.get_password()

    os.environ["AI_MODE"] = extraction_settings.get("ai_mode", "development")

    # Reload config and settings to pick up the new AI_MODE
    reload_config()
    ai_settings.reload()

    logger.info("AI Mode: %s", os.environ["AI_MODE"])


    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        logger.info("Extracting Garmin Connect data...")
        extractor = TriathlonCoachDataExtractor(email, password)

        extraction_config = ExtractionConfig(
            activities_range=extraction_settings["activities_days"],
            metrics_range=extraction_settings["metrics_days"],
            include_detailed_activities=True,
            include_metrics=True,
        )

        garmin_data = extractor.extract_data(extraction_config)
        logger.info("Data extraction completed")

        now = datetime.now()
        plotting_enabled = extraction_settings.get("enable_plotting", False)
        hitl_enabled = extraction_settings.get("hitl_enabled", True)
        skip_synthesis = extraction_settings.get("skip_synthesis", False)

        logger.info("Plotting enabled: %s", plotting_enabled)
        logger.info("HITL enabled: %s", hitl_enabled)
        logger.info("Skip synthesis: %s", skip_synthesis)

        current_date = {"date": now.strftime("%Y-%m-%d"), "day_name": now.strftime("%A")}
        week_dates = [
            {"date": (now + timedelta(days=offset)).strftime("%Y-%m-%d"),
             "day_name": (now + timedelta(days=offset)).strftime("%A")}
            for offset in range(28)
        ]

        logger.info("Running AI analysis and planning...")

        result = await run_complete_analysis_and_planning(
            user_id="cli_user",
            athlete_name=athlete_name,
            garmin_data=asdict(garmin_data),
            analysis_context=analysis_context,
            planning_context=planning_context,
            competitions=competitions,
            current_date=current_date,
            week_dates=week_dates,
            plotting_enabled=plotting_enabled,
            hitl_enabled=hitl_enabled,
            skip_synthesis=skip_synthesis,
        )

        logger.info("Saving results...")

        files_generated: list[str] = []
        files_generated.extend(_save_html_outputs(output_dir, result))
        files_generated.extend(_save_expert_outputs(output_dir, result))
        files_generated.extend(_save_plan_outputs(output_dir, result))

        cost_total = float(
            result.get("cost_summary", {}).get("total_cost_usd", 0.0) or
            result.get("execution_metadata", {}).get("total_cost_usd", 0.0) or
            sum(cost.get("total_cost", 0) for cost in result.get("costs", []))
        )
        total_tokens = int(
            result.get("cost_summary", {}).get("total_tokens", 0) or
            result.get("execution_metadata", {}).get("total_tokens", 0)
        )

        (output_dir / "summary.json").write_text(
            json.dumps({
                "athlete": athlete_name,
                "analysis_date": datetime.now().isoformat(),
                "competitions": competitions,
                "total_cost_usd": cost_total,
                "total_tokens": total_tokens,
                "execution_id": result.get("execution_id", ""),
                "trace_id": result.get("execution_metadata", {}).get("trace_id", ""),
                "root_run_id": result.get("execution_metadata", {}).get("root_run_id", ""),
                "files_generated": files_generated,
            }, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )

        logger.info("✅ Analysis completed successfully!")
        if outside_competitions:
            logger.info("✅  Added %d Outside competitions from config", len(outside_competitions))
        logger.info("📁 Results saved to: %s", output_dir)
        logger.info("💰 Total cost: $%.2f (%d tokens)", cost_total, total_tokens)

        workout_ids: dict[str, Any] = {}
        if extraction_settings.get("upload_to_garmin", False):
            strength_sessions = result.get("strength_sessions") or []
            if strength_sessions:
                logger.info("📲 Uploading %d strength session(s) to Garmin Connect…", len(strength_sessions))
                storage = FilePlanStorage(base_dir=str(output_dir / "storage"))
                workout_ids = _upload_strength_sessions(strength_sessions, email, password)
                if workout_ids:
                    existing = storage.load_json("cli_user", "garmin_workout_ids") or {}
                    existing.update(workout_ids)
                    storage.save_json("cli_user", "garmin_workout_ids", existing)
            else:
                logger.info("📲 upload_to_garmin is enabled but no strength sessions found in plan.")

        _write_to_supabase(result, workout_ids, garmin_data=asdict(garmin_data))
    except Exception as e:
        logger.error("❌ Analysis failed: %s", e)
        raise


async def run_replan_from_config(config_path: Path) -> None:
    """Tier-2 re-plan: fetch 14 days of Garmin data and re-run the weekly planner only."""
    config_parser = ConfigParser(config_path)
    athlete_name, email = config_parser.get_athlete_info()
    _, planning_context = config_parser.get_contexts()
    extraction_settings = config_parser.get_extraction_config()
    competitions = config_parser.get_competitions()
    output_dir = config_parser.get_output_directory()

    storage = FilePlanStorage()
    user_id = "cli_user"

    season_plan = storage.load_plan(user_id, "season_plan")
    if not season_plan:
        logger.error(
            "❌ No season plan found. Run the full pipeline first: --config %s", config_path
        )
        sys.exit(1)

    logger.info("Loaded stored season plan (%d chars)", len(season_plan))

    password = config_parser.get_password()
    os.environ["AI_MODE"] = extraction_settings.get("ai_mode", "development")
    reload_config()
    ai_settings.reload()

    logger.info("Extracting recent Garmin data (14 days)…")
    extractor = TriathlonCoachDataExtractor(email, password)
    garmin_data = extractor.extract_data(
        ExtractionConfig(
            activities_range=14,
            metrics_range=14,
            include_detailed_activities=True,   # needed to populate recent_activities
            include_metrics=False,              # skip physiological markers — saves ~60% of API calls
            include_long_term_trends=False,     # skip 360-day trend fetch
        )
    )

    now = datetime.now()
    current_date = {"date": now.strftime("%Y-%m-%d"), "day_name": now.strftime("%A")}
    week_dates = [
        {
            "date": (now + timedelta(days=i)).strftime("%Y-%m-%d"),
            "day_name": (now + timedelta(days=i)).strftime("%A"),
        }
        for i in range(28)
    ]

    logger.info("Running Tier-2 re-plan…")
    result = await run_replan(
        user_id=user_id,
        athlete_name=athlete_name,
        season_plan=season_plan,
        planning_context=planning_context,
        garmin_data=asdict(garmin_data),
        competitions=competitions,
        current_date=current_date,
        week_dates=week_dates,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    files = _save_plan_outputs(output_dir, result)
    logger.info("✅ Re-plan complete! Updated: %s", files)

    workout_ids: dict[str, Any] = {}
    if extraction_settings.get("upload_to_garmin", False):
        strength_sessions = result.get("strength_sessions") or []
        if strength_sessions:
            logger.info("📲 Uploading %d strength session(s) to Garmin…", len(strength_sessions))
            storage2 = FilePlanStorage(base_dir=str(output_dir / "storage"))
            workout_ids = _upload_strength_sessions(strength_sessions, email, password)
            if workout_ids:
                existing = storage2.load_json("cli_user", "garmin_workout_ids") or {}
                existing.update(workout_ids)
                storage2.save_json("cli_user", "garmin_workout_ids", existing)
        else:
            logger.info("📲 upload_to_garmin is enabled but no strength sessions in re-plan.")

    _write_to_supabase(result, workout_ids, garmin_data=asdict(garmin_data))
    _write_report_to_supabase(output_dir, garmin_data=asdict(garmin_data))


def _write_report_to_supabase(
    output_dir: Path,
    garmin_data: dict[str, Any] | None = None,
) -> None:
    """Upload analysis/planning HTML from disk to Supabase if they exist."""
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        return
    analysis_path = output_dir / "analysis.html"
    planning_path = output_dir / "planning.html"
    analysis_html = analysis_path.read_text(encoding="utf-8") if analysis_path.exists() else None
    planning_html = planning_path.read_text(encoding="utf-8") if planning_path.exists() else None
    if analysis_html or planning_html:
        try:
            bench_e1rm = _compute_bench_e1rm(garmin_data or {})
            predicted_5k = _compute_predicted_5k_secs(garmin_data or {})
            write_report(
                analysis_html=analysis_html,
                planning_html=planning_html,
                bench_e1rm_kg=bench_e1rm,
                predicted_5k_secs=predicted_5k,
            )
        except Exception as exc:
            logger.warning("⚠️  Report write to Supabase failed: %s", exc)


def _compute_bench_e1rm(garmin_data: dict[str, Any]) -> float | None:
    """Epley e1RM from the heaviest barbell bench set across recent activities."""
    best: float | None = None
    for act in (garmin_data.get("recent_activities") or []):
        for s in (act.get("exercise_sets") or []):
            if s.get("set_type") == "REST":
                continue
            cat = (s.get("exercise_category") or "").upper()
            if "BENCH_PRESS" not in cat:
                continue
            name = (s.get("exercise_name") or "").upper()
            if any(x in name for x in ("MACHINE", "SMITH", "CABLE")):
                continue
            w = s.get("weight_kg")
            r = s.get("reps")
            if w and r and r > 1:
                e1rm = w * (1 + r / 30)
                if best is None or e1rm > best:
                    best = e1rm
    return round(best, 1) if best is not None else None


def _compute_predicted_5k_secs(garmin_data: dict[str, Any]) -> int | None:
    """Extract 5k prediction (seconds) from Garmin race predictions payload."""
    preds = garmin_data.get("race_predictions")
    if not preds or not isinstance(preds, dict):
        return None
    # Garmin returns the payload nested; walk common key variants defensively.
    candidates = [
        preds.get("fiveK"),
        preds.get("5k"),
        preds.get("raceTime5K"),
        (preds.get("racePredictions") or {}).get("raceTime5K"),
        (preds.get("racePredictions") or {}).get("fiveK"),
    ]
    for c in candidates:
        if c is None:
            continue
        secs = c if isinstance(c, (int, float)) else c.get("time") or c.get("raceDuration")
        if secs:
            return int(secs)
    # Log the raw payload once so we can refine the key on the next run.
    logger.info("race_predictions payload (for key mapping): %s", json.dumps(preds)[:500])
    return None


def _write_to_supabase(
    result: dict[str, Any],
    workout_ids: dict[str, Any],
    garmin_data: dict[str, Any] | None = None,
) -> None:
    """Write the completed plan to Supabase. Logs a warning and continues on failure."""
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        logger.debug("Supabase not configured — skipping write.")
        return
    try:
        weekly_plan = result.get("weekly_plan") or {}
        markdown = weekly_plan.get("output", "") if isinstance(weekly_plan, dict) else str(weekly_plan)
        plan_id = write_plan(
            markdown=markdown,
            scheduled_days=result.get("scheduled_days") or [],
            strength_sessions=result.get("strength_sessions") or [],
            garmin_workout_ids=workout_ids,
        )
        logger.info("📊 Plan saved to Supabase (id=%s)", plan_id)
        analysis_html = result.get("analysis_html") or ""
        planning_html = result.get("planning_html") or ""
        if isinstance(analysis_html, dict):
            analysis_html = analysis_html.get("content", "")
        if isinstance(planning_html, dict):
            planning_html = planning_html.get("content", "")
        if analysis_html or planning_html:
            bench_e1rm = _compute_bench_e1rm(garmin_data or {})
            predicted_5k = _compute_predicted_5k_secs(garmin_data or {})
            if bench_e1rm:
                logger.info("📈 Bench e1RM: %.1f kg", bench_e1rm)
            if predicted_5k:
                logger.info("🏃 Predicted 5k: %d s (%d:%02d)", predicted_5k, predicted_5k // 60, predicted_5k % 60)
            write_report(
                analysis_html=analysis_html,
                planning_html=planning_html,
                bench_e1rm_kg=bench_e1rm,
                predicted_5k_secs=predicted_5k,
            )
    except Exception as exc:
        logger.warning("⚠️  Supabase write failed (plan still saved locally): %s", exc)


def _upload_strength_sessions(
    strength_sessions: list[dict[str, Any]],
    email: str,
    password: str,
) -> dict[str, Any]:
    """Upload strength sessions to Garmin. Returns {date: {workout_id, schedule_id, name}} mapping."""
    gc = GarminConnectClient()
    gc.connect(email=email, password=password)
    client = gc.client
    workout_ids: dict[str, Any] = {}
    try:
        for s in strength_sessions:
            exercises = [
                PlannedExercise(
                    garmin_category=ex["garmin_category"],
                    display_name=ex["display_name"],
                    garmin_exercise_key=ex.get("garmin_exercise_key"),
                    sets=[PlannedSet(
                        reps=ex["reps"],
                        weight_kg=ex.get("weight_kg"),
                    )] * ex["sets"],
                    rest_seconds=ex.get("rest_seconds", 120),
                )
                for ex in s.get("exercises", [])
            ]
            # Prepend date to the workout name so each session is uniquely identifiable
            # in Garmin Connect (e.g. "Jun 23 · Upper A").
            raw_date = s["date"]
            try:
                date_prefix = datetime.strptime(raw_date, "%Y-%m-%d").strftime("%b %-d")
            except ValueError:
                date_prefix = raw_date
            workout_name = f"{date_prefix} · {s['name']}"
            session = PlannedStrengthSession(
                name=workout_name,
                date=raw_date,
                exercises=exercises,
                estimated_duration_secs=s.get("estimated_duration_secs", 3600),
            )
            try:
                entry = upload_strength_session(client, session)
                workout_ids[session.date] = entry
                logger.info(
                    "✅ '%s' → workoutId=%s scheduled on %s",
                    session.name, entry["workout_id"], session.date,
                )
            except Exception:
                logger.exception("❌ Failed to upload '%s'", session.name)
    finally:
        gc.disconnect()
    return workout_ids



def create_config_template(output_path: Path) -> None:
    template_path = Path(__file__).parent / "coach_config_template.yaml"

    if template_path.exists():
        output_path.write_text(template_path.read_text(encoding="utf-8"), encoding="utf-8")
        logger.info("✅ Config template created: %s", output_path)
        logger.info("Edit this file with your settings and run analysis with --config")
    else:
        logger.error("❌ Template file not found")


def main():
    parser = argparse.ArgumentParser(
        description="Garmin AI Coach CLI - AI Triathlon Coach",
        epilog="Example: python garmin_ai_coach_cli.py --config my_config.yaml",
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--config", type=Path, help="Path to configuration file (YAML or JSON)")
    group.add_argument("--replan", type=Path, metavar="CONFIG",
                       help="Tier-2 weekly re-plan: fetch 14 days of Garmin data and re-run "
                            "only the weekly planner against the stored season plan (~$0.20-0.40)")
    group.add_argument("--init-config", type=Path, help="Create a configuration template file")

    parser.add_argument("--output-dir", type=Path, help="Override output directory from config")

    args = parser.parse_args()

    if args.init_config:
        create_config_template(args.init_config)
        return

    if args.config:
        try:
            asyncio.run(run_analysis_from_config(args.config))
        except KeyboardInterrupt:
            logger.info("❌ Analysis cancelled by user")
        except Exception as e:
            logger.error("❌ Analysis failed: %s", e)
            sys.exit(1)

    if args.replan:
        try:
            asyncio.run(run_replan_from_config(args.replan))
        except KeyboardInterrupt:
            logger.info("❌ Re-plan cancelled by user")
        except Exception as e:
            logger.error("❌ Re-plan failed: %s", e)
            sys.exit(1)


if __name__ == "__main__":
    main()
