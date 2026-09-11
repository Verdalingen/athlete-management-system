
import logging
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

from services.ai.ai_settings import TIER_MODEL, Tier

env_file = os.getenv("ENV_FILE", ".env")
load_dotenv(env_file)

logger = logging.getLogger(__name__)

_config_cache: "Config | None" = None


def _tier_models_from_env() -> dict[Tier, str]:
    # MODEL_FAST / MODEL_REASONING / MODEL_DEEP override a tier's default model.
    # Validation against the catalogue happens in ModelSelector, where the
    # catalogue lives, so an unknown name fails at first use with a clear error.
    return {
        tier: os.getenv(f"MODEL_{tier.name}", default) for tier, default in TIER_MODEL.items()
    }


@dataclass
class Config:
    anthropic_api_key: str | None = None
    tier_models: dict[Tier, str] = field(default_factory=lambda: dict(TIER_MODEL))

    @classmethod
    def from_env(cls) -> "Config":
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")

        if anthropic_api_key and not anthropic_api_key.startswith(("sk-ant-api03-", "sk-ant-")):
            raise ValueError("Invalid ANTHROPIC_API_KEY format")

        return cls(
            anthropic_api_key=anthropic_api_key,
            tier_models=_tier_models_from_env(),
        )


def get_config() -> Config:
    global _config_cache  # noqa: PLW0603
    if _config_cache is None:
        _config_cache = Config.from_env()
    return _config_cache


def reload_config() -> Config:
    global _config_cache  # noqa: PLW0603
    _config_cache = None
    return get_config()
