import json
from unittest.mock import AsyncMock, patch

import pytest

from services.garmin.models import GarminData


@pytest.mark.asyncio
@patch("cli.ams._sync_completed_exercise_sets")
@patch("cli.ams.upsert_completed_activities")
@patch("cli.ams.upsert_daily_metrics_batch")
@patch("cli.ams._write_to_supabase")
@patch("cli.ams.get_sync_gap_days", side_effect=lambda days: days)
@patch("services.supabase.athlete_profile.get_recurring_session_requests", return_value=[])
@patch("services.supabase.athlete_profile.build_planning_context", return_value="Planning context")
@patch("services.supabase.athlete_profile.get_analysis_context", return_value="Analysis context")
@patch("services.ai.langgraph.workflows.planning_workflow.run_complete_analysis_and_planning", new_callable=AsyncMock)
@patch("services.garmin.TriathlonCoachDataExtractor")
async def test_cli_e2e_smoke_with_mocks(
    mock_extractor_class,
    mock_workflow,
    mock_get_analysis_context,
    mock_build_planning_context,
    mock_get_recurring_session_requests,
    mock_write_to_supabase,
    mock_get_sync_gap_days,
    mock_upsert_daily_metrics_batch,
    mock_upsert_completed_activities,
    mock_sync_completed_exercise_sets,
    tmp_path,
    monkeypatch,
):
    """Test CLI end-to-end with all external dependencies mocked.

    Coaching context is read live from Supabase (services.supabase.athlete_profile), not from
    the config file's context.analysis/planning fields — those are accepted for backward
    compatibility but ignored (see ConfigParser.get_contexts()). The post-generation Supabase
    writes (_write_to_supabase and friends) are mocked too, since this test only asserts on
    the local HTML/JSON outputs.
    """
    monkeypatch.setenv("SUPABASE_USER_ID", "test-user-id")
    # Configure workflow mock
    mock_workflow.return_value = {
        "analysis_html": "<html><body>Analysis OK</body></html>",
        "planning_html": "<html><body>Plan OK</body></html>",
        "metrics_outputs": None,
        "activity_outputs": None,
        "physiology_outputs": None,
        "season_plan": {"output": "Season OK"},
        "weekly_plan": {"output": "Weekly OK"},
        "cost_summary": {"total_cost_usd": 0.0, "total_tokens": 0},
        "execution_id": "test-exec",
        "execution_metadata": {"trace_id": "trace-1", "root_run_id": "root-1"},
    }

    # Configure extractor mock
    mock_instance = mock_extractor_class.return_value
    mock_instance.extract_data.return_value = GarminData()


    # Import after patches are in place
    from cli.ams import run_analysis_from_config

    output_directory = tmp_path / "out"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        f"""
athlete:
  name: "Test A"
  email: "user@example.com"

context:
  analysis: "Analysis context"
  planning: "Planning context"

extraction:
  activities_days: 7
  metrics_days: 14
  ai_mode: "development"
  hitl_enabled: false

output:
  directory: "{output_directory.as_posix()}"

credentials:
  password: "dummy"
""",
        encoding="utf-8",
    )

    await run_analysis_from_config(config_path)

    analysis_path = output_directory / "analysis.html"
    planning_path = output_directory / "planning.html"
    summary_path = output_directory / "summary.json"
    assert analysis_path.exists()
    assert planning_path.exists()
    assert summary_path.exists()

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["athlete"] == "Test A"
    assert summary["total_cost_usd"] == 0.0


@pytest.mark.asyncio
@patch("cli.ams._sync_completed_exercise_sets")
@patch("cli.ams.upsert_completed_activities")
@patch("cli.ams.upsert_daily_metrics_batch")
@patch("cli.ams._write_to_supabase")
@patch("cli.ams.get_sync_gap_days", side_effect=lambda days: days)
@patch("services.supabase.athlete_profile.get_recurring_session_requests", return_value=[])
@patch("services.supabase.athlete_profile.build_planning_context", return_value="Planning context")
@patch("services.supabase.athlete_profile.get_analysis_context", return_value="Analysis context")
@patch("services.ai.langgraph.workflows.planning_workflow.run_complete_analysis_and_planning", new_callable=AsyncMock)
@patch("services.garmin.TriathlonCoachDataExtractor")
@patch("getpass.getpass", return_value="dummy")
@patch("builtins.input", side_effect=["My goal is to complete a marathon"])
async def test_cli_e2e_with_hitl_enabled(
    mock_input,
    mock_getpass,
    mock_extractor_class,
    mock_workflow,
    mock_get_analysis_context,
    mock_build_planning_context,
    mock_get_recurring_session_requests,
    mock_write_to_supabase,
    mock_get_sync_gap_days,
    mock_upsert_daily_metrics_batch,
    mock_upsert_completed_activities,
    mock_sync_completed_exercise_sets,
    tmp_path,
    monkeypatch,
):
    """Test CLI with HITL enabled to ensure user interactions work."""
    monkeypatch.setenv("SUPABASE_USER_ID", "test-user-id")
    # Configure workflow mock
    mock_workflow.return_value = {
        "analysis_html": "<html><body>Analysis with HITL</body></html>",
        "planning_html": "<html><body>Plan with HITL</body></html>",
       "metrics_outputs": None,
        "activity_outputs": None,
        "physiology_outputs": None,
        "season_plan": {"output": "Season OK"},
        "weekly_plan": {"output": "Weekly OK"},
        "cost_summary": {"total_cost_usd": 0.05, "total_tokens": 1000},
        "execution_id": "test-exec-hitl",
        "execution_metadata": {"trace_id": "trace-hitl", "root_run_id": "root-hitl"},
    }

    # Configure extractor mock
    mock_instance = mock_extractor_class.return_value
    mock_instance.extract_data.return_value = GarminData()


    # Import after patches are in place
    from cli.ams import run_analysis_from_config

    output_directory = tmp_path / "out_hitl"
    config_path = tmp_path / "config_hitl.yaml"
    config_path.write_text(
        f"""
athlete:
  name: "Test Athlete HITL"
  email: "user@example.com"

context:
  analysis: "HITL Analysis context"
  planning: "HITL Planning context"

extraction:
  activities_days: 7
  metrics_days: 14
  ai_mode: "development"
  hitl_enabled: true

output:
  directory: "{output_directory.as_posix()}"

credentials:
  password: "dummy"
""",
        encoding="utf-8",
    )

    await run_analysis_from_config(config_path)

    analysis_path = output_directory / "analysis.html"
    planning_path = output_directory / "planning.html"
    summary_path = output_directory / "summary.json"

    assert analysis_path.exists()
    assert planning_path.exists()
    assert summary_path.exists()

    # Verify the basic structure is correct
    assert analysis_path.read_text(encoding="utf-8").startswith("<html>")
    assert planning_path.read_text(encoding="utf-8").startswith("<html>")

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["athlete"] == "Test Athlete HITL"
    assert "total_cost_usd" in summary
    assert "total_tokens" in summary
