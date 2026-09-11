import logging
from dataclasses import dataclass
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from core.config import get_config

from .ai_settings import AgentRole, ai_settings

logger = logging.getLogger(__name__)

OPENAI_BASE_URL = "https://api.openai.com/v1"


@dataclass
class ModelConfiguration:
    name: str
    provider: str  # "anthropic" | "openai"


class ModelSelector:
    # Every entry here is assigned to at least one role in ai_settings. Add a
    # model by adding it to both this catalogue and a mode's assignments; an
    # entry nothing assigns is dead weight.
    CONFIGURATIONS: dict[str, ModelConfiguration] = {
        "claude-haiku": ModelConfiguration(name="claude-haiku-4-5-20251001", provider="anthropic"),
        "claude-sonnet": ModelConfiguration(name="claude-sonnet-5", provider="anthropic"),
        "claude-opus": ModelConfiguration(name="claude-opus-4-8", provider="anthropic"),
        "gpt-5": ModelConfiguration(name="gpt-5.2", provider="openai"),
        "gpt-5-search": ModelConfiguration(name="gpt-5.2", provider="openai"),
        "gpt-5.2-pro-search": ModelConfiguration(name="gpt-5.2-pro", provider="openai"),
    }

    MODEL_CONFIGS: dict[str, dict[str, Any]] = {
        "claude-sonnet": {
            "max_tokens": 64000,
            "log": "Using extended output tokens for {role} (max_tokens: 64000)",
        },
        "claude-opus": {
            "max_tokens": 32000,
            "log": "Using extended output tokens for {role} (max_tokens: 32000)",
        },
        "gpt-5": {
            "use_responses_api": True,
            "reasoning": {"effort": "xhigh"},
            "model_kwargs": {"text": {"verbosity": "high"}},
            "log": "Using GPT-5 with Responses API for {role} (verbosity: high, reasoning_effort: xhigh)",
        },
        "gpt-5-search": {
            "use_responses_api": True,
            "reasoning": {"effort": "xhigh"},
            "model_kwargs": {
                "text": {"verbosity": "high"},
                "tools": [{"type": "web_search"}],
                "include": ["web_search_call.action.sources"],
            },
            "log": "Using GPT-5.2 with web search + Responses API for {role} (verbosity: high, reasoning_effort: xhigh)",
        },
        "gpt-5.2-pro-search": {
            "use_responses_api": True,
            "reasoning": {"effort": "xhigh"},
            "model_kwargs": {
                "text": {"verbosity": "high"},
                "tools": [{"type": "web_search"}],
                "include": ["web_search_call.action.sources"],
            },
            "log": "Using GPT-5.2 Pro with web search + Responses API for {role} (verbosity: high, reasoning_effort: xhigh)",
        },
    }

    @classmethod
    def _apply_model_config(cls, model_name: str, role: AgentRole, llm_params: dict[str, Any]):
        if model_name not in cls.MODEL_CONFIGS:
            return

        config_data = cls.MODEL_CONFIGS[model_name].copy()
        log_msg = config_data.pop("log", None)
        llm_params.update(config_data)
        if log_msg:
            logger.info(str(log_msg).format(role=role.value))

    @classmethod
    def get_llm(cls, role: AgentRole):
        model_name = ai_settings.get_model_for_role(role)
        selected = cls.CONFIGURATIONS.get(model_name)
        if not selected:
            raise RuntimeError(f"Unknown model '{model_name}' in configuration")
        config = get_config()

        api_key = {
            "anthropic": config.anthropic_api_key,
            "openai": config.openai_api_key,
        }[selected.provider]
        if not api_key:
            raise RuntimeError(
                f"{selected.provider.upper()}_API_KEY is required for model '{model_name}'"
            )

        logger.info("Configuring LLM for role %s with model %s", role.value, selected.name)

        llm_params: dict[str, Any] = {"model": selected.name, "api_key": api_key}
        cls._apply_model_config(model_name, role, llm_params)

        if selected.provider == "anthropic":
            return ChatAnthropic(**llm_params)

        llm_params["base_url"] = OPENAI_BASE_URL
        return ChatOpenAI(**llm_params)
