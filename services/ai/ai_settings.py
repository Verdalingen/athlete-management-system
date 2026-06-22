from dataclasses import dataclass, field
from enum import Enum

from core.config import AIMode, get_config


class AgentRole(Enum):
    SUMMARIZER = "summarizer"
    METRICS_EXPERT = "metrics_expert"
    PHYSIOLOGY_EXPERT = "physiology_expert"
    ACTIVITY_EXPERT = "activity_expert"
    SYNTHESIS = "synthesis"
    WORKOUT = "workout"
    SEASON_PLANNER = "season_planner"
    FORMATTER = "formatter"


@dataclass
class AISettings:
    mode: AIMode

    model_assignments: dict[AIMode, dict[AgentRole, str]] = field(
        default_factory=lambda: {
            # Tiered Claude-only setup. Haiku for cheap nodes, Sonnet for reasoning.
            # Requires ANTHROPIC_API_KEY; falls back to OpenRouter if not set.
            AIMode.DEVELOPMENT: {
                AgentRole.SUMMARIZER: "claude-haiku",    # just reformatting data
                AgentRole.FORMATTER: "claude-haiku",     # just reformatting data
                AgentRole.METRICS_EXPERT: "claude-sonnet",
                AgentRole.PHYSIOLOGY_EXPERT: "claude-sonnet",
                AgentRole.ACTIVITY_EXPERT: "claude-sonnet",
                AgentRole.SYNTHESIS: "claude-sonnet",
                AgentRole.WORKOUT: "claude-sonnet",
                AgentRole.SEASON_PLANNER: "claude-sonnet",
            },
            # All Haiku — very cheap, lower quality. Good for testing pipelines.
            AIMode.COST_EFFECTIVE: {
                AgentRole.SUMMARIZER: "claude-haiku",
                AgentRole.FORMATTER: "claude-haiku",
                AgentRole.METRICS_EXPERT: "claude-haiku",
                AgentRole.PHYSIOLOGY_EXPERT: "claude-haiku",
                AgentRole.ACTIVITY_EXPERT: "claude-haiku",
                AgentRole.SYNTHESIS: "claude-haiku",
                AgentRole.WORKOUT: "claude-haiku",
                AgentRole.SEASON_PLANNER: "claude-haiku",
            },
            # Opus for planning, Sonnet for analysis, Haiku for formatting.
            AIMode.STANDARD: {
                AgentRole.SUMMARIZER: "claude-haiku",
                AgentRole.FORMATTER: "claude-haiku",
                AgentRole.METRICS_EXPERT: "claude-sonnet",
                AgentRole.PHYSIOLOGY_EXPERT: "claude-sonnet",
                AgentRole.ACTIVITY_EXPERT: "claude-sonnet",
                AgentRole.SYNTHESIS: "claude-sonnet",
                AgentRole.WORKOUT: "claude-sonnet",
                AgentRole.SEASON_PLANNER: "claude-opus",
            },
            # GPT-5 Pro for everything — maximum quality, high cost.
            AIMode.PRO: {
                AgentRole.SUMMARIZER: "gpt-5",
                AgentRole.FORMATTER: "gpt-5",
                AgentRole.METRICS_EXPERT: "gpt-5.2-pro-search",
                AgentRole.PHYSIOLOGY_EXPERT: "gpt-5.2-pro-search",
                AgentRole.ACTIVITY_EXPERT: "gpt-5.2-pro-search",
                AgentRole.SYNTHESIS: "gpt-5-search",
                AgentRole.WORKOUT: "gpt-5.2-pro-search",
                AgentRole.SEASON_PLANNER: "gpt-5.2-pro-search",
            },
        }
    )

    def get_model_for_role(self, role: AgentRole) -> str:
        return self.model_assignments[self.mode][role]

    @classmethod
    def load_settings(cls) -> "AISettings":
        return cls(mode=get_config().ai_mode)

    def reload(self) -> None:
        self.mode = get_config().ai_mode


# Global settings instance
ai_settings = AISettings.load_settings()
