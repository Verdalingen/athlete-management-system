import logging
from dataclasses import dataclass, field
from typing import Any

from langchain_anthropic import ChatAnthropic

from core.config import get_config

from .ai_settings import ROLE_TIER, AgentRole

logger = logging.getLogger(__name__)


@dataclass
class ModelConfiguration:
    name: str
    params: dict[str, Any] = field(default_factory=dict)  # extra ChatAnthropic kwargs


class ModelSelector:
    # The models a tier may be set to. Add here to make a name valid for
    # MODEL_FAST / MODEL_REASONING / MODEL_DEEP or for TIER_MODEL.
    CONFIGURATIONS: dict[str, ModelConfiguration] = {
        "claude-haiku": ModelConfiguration(name="claude-haiku-4-5"),
        "claude-sonnet": ModelConfiguration(name="claude-sonnet-5", params={"max_tokens": 64000}),
        "claude-opus": ModelConfiguration(name="claude-opus-4-8", params={"max_tokens": 32000}),
    }

    @classmethod
    def model_for(cls, role: AgentRole) -> str:
        """The catalogue key a role resolves to, after any env override of its tier."""
        return get_config().tier_models[ROLE_TIER[role]]

    @classmethod
    def get_llm(cls, role: AgentRole):
        model_name = cls.model_for(role)
        selected = cls.CONFIGURATIONS.get(model_name)
        if not selected:
            raise RuntimeError(
                f"Unknown model '{model_name}' for {role.value} "
                f"(valid: {', '.join(sorted(cls.CONFIGURATIONS))})"
            )

        api_key = get_config().anthropic_api_key
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required")

        logger.info("%s -> %s (%s)", role.value, model_name, ROLE_TIER[role].value)
        params: dict[str, Any] = {"model": selected.name, "api_key": api_key, **selected.params}
        return ChatAnthropic(**params)
