"""Tests for services/ai/langgraph/schemas/program_spec_outputs.py — the season planner's
structured-output schema, and the spec-assembly step (deterministic pieces + LLM draft ->
ProgramSpec) that season_planner_node.author_feasible_spec relies on to catch a bad reference."""
import pytest
from pydantic import ValidationError

from services.ai.langgraph.schemas.program_spec_outputs import (
    NewSessionTypeDraft,
    SeasonPlannerOutput,
    SeasonProgramSpecDraft,
)
from services.scheduling.program_spec import ProgramSessionType, ProgramSpec, WeeklyTarget


def _draft(**overrides) -> SeasonProgramSpecDraft:
    kwargs = {"spec_rationale": "Test rationale."}
    kwargs.update(overrides)
    return SeasonProgramSpecDraft(**kwargs)


class TestSeasonProgramSpecDraft:
    def test_minimal_draft_is_valid(self):
        draft = _draft()
        assert draft.new_session_types == []
        assert draft.horizon_weeks == 6

    def test_new_session_type_rejects_strength_kind(self):
        with pytest.raises(ValidationError):
            NewSessionTypeDraft(key="x", category="c", label="X", session_kind="strength")


class TestSeasonPlannerOutputValidation:
    def test_final_answer_requires_program_spec(self):
        with pytest.raises(ValidationError):
            SeasonPlannerOutput(output="# Season Plan\n...", program_spec=None)

    def test_final_answer_with_program_spec_is_valid(self):
        out = SeasonPlannerOutput(output="# Season Plan\n...", program_spec=_draft())
        assert out.program_spec is not None

    def test_hitl_questions_do_not_require_program_spec(self):
        out = SeasonPlannerOutput(
            output=[{"id": "q1", "message": "How many days can you train?"}],
            program_spec=None,
        )
        assert out.program_spec is None


class TestSpecAssemblyFromDraftPlusDeterministic:
    """Mirrors the assembly step inside author_feasible_spec: deterministic strength types +
    the LLM's new_session_types/weekly_targets merged into one ProgramSpec."""

    def _deterministic_types(self):
        return [
            ProgramSessionType(key="strength-a", category="leg-strength", label="A", session_kind="strength", is_key=True),
        ]

    def test_valid_draft_assembles_cleanly(self):
        deterministic_types = self._deterministic_types()
        draft = _draft(
            new_session_types=[
                NewSessionTypeDraft(key="tempo-run", category="key-run", label="Tempo", session_kind="run", is_key=True),
            ],
            weekly_targets=[WeeklyTarget(session_type_key="tempo-run", min_per_week=1, max_per_week=1)],
        )
        session_types = deterministic_types + [
            ProgramSessionType(**nt.model_dump()) for nt in draft.new_session_types
        ]
        spec = ProgramSpec(session_types=session_types, weekly_targets=draft.weekly_targets)
        assert spec.session_type("tempo-run").category == "key-run"

    def test_weekly_target_referencing_unknown_key_raises(self):
        deterministic_types = self._deterministic_types()
        draft = _draft(
            weekly_targets=[WeeklyTarget(session_type_key="does-not-exist", min_per_week=1, max_per_week=1)],
        )
        session_types = deterministic_types + [
            ProgramSessionType(**nt.model_dump()) for nt in draft.new_session_types
        ]
        with pytest.raises(ValidationError):
            ProgramSpec(session_types=session_types, weekly_targets=draft.weekly_targets)

    def test_spacing_constraint_referencing_unknown_category_raises(self):
        from services.scheduling.program_spec import SpacingConstraint

        deterministic_types = self._deterministic_types()
        draft = _draft(
            spacing_constraints=[
                SpacingConstraint(from_category="nope", to_category="leg-strength", min_gap_hours=24)
            ],
        )
        with pytest.raises(ValidationError):
            ProgramSpec(session_types=deterministic_types, spacing_constraints=draft.spacing_constraints)
