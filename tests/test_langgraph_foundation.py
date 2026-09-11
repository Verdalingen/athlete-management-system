import pytest

from services.ai.langgraph.state.training_analysis_state import (
    TrainingAnalysisState,
    create_initial_state,
)


class TestLangGraphFoundation:

    def test_state_creation(self):
        state = create_initial_state(
            user_id="test_user", athlete_name="Test Athlete", garmin_data={"test": "data"}
        )

        assert state["user_id"] == "test_user"
        assert state["athlete_name"] == "Test Athlete"
        assert state["garmin_data"] == {"test": "data"}
        assert isinstance(state["plots"], list)
        assert isinstance(state["timings"], list)
        assert isinstance(state["errors"], list)

    def test_langgraph_import(self):
        from langgraph.graph import StateGraph

        workflow = StateGraph(TrainingAnalysisState)
        assert workflow is not None

    def test_module_imports(self):
        from services.ai.langgraph import TrainingAnalysisState

        assert TrainingAnalysisState is not None


if __name__ == "__main__":
    pytest.main([__file__])
