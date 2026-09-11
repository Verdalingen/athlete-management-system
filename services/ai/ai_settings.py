from dataclasses import dataclass, field
from enum import Enum

from core.config import AIMode, get_config


class AgentRole(Enum):
    SUMMARIZER = "summarizer"
    METRICS_EXPERT = "metrics_expert"
    PHYSIOLOGY_EXPERT = "physiology_expert"
    ACTIVITY_EXPERT = "activity_expert"
    NUTRITION_SUMMARIZER = "nutrition_summarizer"
    NUTRITION_EXPERT = "nutrition_expert"
    LIFESTYLE_SUMMARIZER = "lifestyle_summarizer"
    LIFESTYLE_EXPERT = "lifestyle_expert"
    NUTRITION_PLANNER = "nutrition_planner"
    RACE_STRATEGY = "race_strategy"
    SYNTHESIS = "synthesis"
    WORKOUT = "workout"
    SEASON_PLANNER = "season_planner"
    FORMATTER = "formatter"


@dataclass
class AISettings:
    mode: AIMode

    model_assignments: dict[AIMode, dict[AgentRole, str]] = field(
        default_factory=lambda: {
            # Tiered Claude setup. Haiku for cheap nodes, Sonnet for reasoning.
            # Requires ANTHROPIC_API_KEY. The pro mode needs OPENAI_API_KEY instead.
            AIMode.DEVELOPMENT: {
                AgentRole.SUMMARIZER: "claude-haiku",
                AgentRole.FORMATTER: "claude-haiku",
                AgentRole.METRICS_EXPERT: "claude-sonnet",
                AgentRole.PHYSIOLOGY_EXPERT: "claude-sonnet",
                AgentRole.ACTIVITY_EXPERT: "claude-sonnet",
                AgentRole.NUTRITION_SUMMARIZER: "claude-haiku",
                AgentRole.NUTRITION_EXPERT: "claude-sonnet",
                AgentRole.LIFESTYLE_SUMMARIZER: "claude-haiku",
                AgentRole.LIFESTYLE_EXPERT: "claude-sonnet",
                AgentRole.NUTRITION_PLANNER: "claude-sonnet",
                AgentRole.RACE_STRATEGY: "claude-sonnet",
                AgentRole.SYNTHESIS: "claude-sonnet",
                AgentRole.WORKOUT: "claude-sonnet",
                AgentRole.SEASON_PLANNER: "claude-sonnet",
            },
            AIMode.COST_EFFECTIVE: {
                AgentRole.SUMMARIZER: "claude-haiku",
                AgentRole.FORMATTER: "claude-haiku",
                AgentRole.METRICS_EXPERT: "claude-haiku",
                AgentRole.PHYSIOLOGY_EXPERT: "claude-haiku",
                AgentRole.ACTIVITY_EXPERT: "claude-haiku",
                AgentRole.NUTRITION_SUMMARIZER: "claude-haiku",
                AgentRole.NUTRITION_EXPERT: "claude-haiku",
                AgentRole.LIFESTYLE_SUMMARIZER: "claude-haiku",
                AgentRole.LIFESTYLE_EXPERT: "claude-haiku",
                AgentRole.NUTRITION_PLANNER: "claude-haiku",
                AgentRole.RACE_STRATEGY: "claude-haiku",
                AgentRole.SYNTHESIS: "claude-haiku",
                AgentRole.WORKOUT: "claude-haiku",
                AgentRole.SEASON_PLANNER: "claude-haiku",
            },
            AIMode.STANDARD: {
                AgentRole.SUMMARIZER: "claude-haiku",
                AgentRole.FORMATTER: "claude-haiku",
                AgentRole.METRICS_EXPERT: "claude-sonnet",
                AgentRole.PHYSIOLOGY_EXPERT: "claude-sonnet",
                AgentRole.ACTIVITY_EXPERT: "claude-sonnet",
                AgentRole.NUTRITION_SUMMARIZER: "claude-haiku",
                AgentRole.NUTRITION_EXPERT: "claude-sonnet",
                AgentRole.LIFESTYLE_SUMMARIZER: "claude-haiku",
                AgentRole.LIFESTYLE_EXPERT: "claude-sonnet",
                AgentRole.NUTRITION_PLANNER: "claude-sonnet",
                AgentRole.RACE_STRATEGY: "claude-sonnet",
                AgentRole.SYNTHESIS: "claude-sonnet",
                AgentRole.WORKOUT: "claude-sonnet",
                AgentRole.SEASON_PLANNER: "claude-opus",
            },
            AIMode.PRO: {
                AgentRole.SUMMARIZER: "gpt-5",
                AgentRole.FORMATTER: "gpt-5",
                AgentRole.METRICS_EXPERT: "gpt-5.2-pro-search",
                AgentRole.PHYSIOLOGY_EXPERT: "gpt-5.2-pro-search",
                AgentRole.ACTIVITY_EXPERT: "gpt-5.2-pro-search",
                AgentRole.NUTRITION_SUMMARIZER: "gpt-5",
                AgentRole.NUTRITION_EXPERT: "gpt-5.2-pro-search",
                AgentRole.LIFESTYLE_SUMMARIZER: "gpt-5",
                AgentRole.LIFESTYLE_EXPERT: "gpt-5.2-pro-search",
                AgentRole.NUTRITION_PLANNER: "gpt-5.2-pro-search",
                AgentRole.RACE_STRATEGY: "gpt-5.2-pro-search",
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
