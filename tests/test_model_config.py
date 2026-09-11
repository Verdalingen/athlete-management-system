import types

import pytest

from core.config import Config, _tier_models_from_env
from services.ai import model_config
from services.ai.ai_settings import ROLE_TIER, TIER_MODEL, AgentRole, Tier
from services.ai.model_config import ModelSelector


def _capture_anthropic(monkeypatch):
    captured: dict = {}

    def fake_chat_anthropic(**kwargs):
        captured.update(kwargs)
        return types.SimpleNamespace(**kwargs)

    monkeypatch.setattr(model_config, "ChatAnthropic", fake_chat_anthropic)
    return captured


@pytest.mark.parametrize(
    ("role", "expected_model"),
    [
        (AgentRole.METRICS_SUMMARIZER, "claude-haiku-4-5-20251001"),  # fast
        (AgentRole.WEEKLY_PLANNER, "claude-sonnet-5"),  # reasoning
        (AgentRole.SEASON_PLANNER, "claude-opus-4-8"),  # deep
    ],
)
def test_role_resolves_through_its_tier(monkeypatch, role, expected_model):
    config = Config(anthropic_api_key="sk-ant-api03-test")
    monkeypatch.setattr(model_config, "get_config", lambda: config)
    captured = _capture_anthropic(monkeypatch)

    ModelSelector.get_llm(role)

    assert captured["model"] == expected_model
    assert captured["api_key"] == "sk-ant-api03-test"


def test_env_override_changes_a_tier_without_touching_others(monkeypatch):
    monkeypatch.setenv("MODEL_DEEP", "claude-sonnet")
    monkeypatch.delenv("MODEL_FAST", raising=False)
    monkeypatch.delenv("MODEL_REASONING", raising=False)

    tiers = _tier_models_from_env()

    assert tiers[Tier.DEEP] == "claude-sonnet"
    assert tiers[Tier.FAST] == TIER_MODEL[Tier.FAST]
    assert tiers[Tier.REASONING] == TIER_MODEL[Tier.REASONING]


def test_per_model_params_applied(monkeypatch):
    config = Config(anthropic_api_key="sk-ant-api03-test")
    monkeypatch.setattr(model_config, "get_config", lambda: config)
    captured = _capture_anthropic(monkeypatch)

    ModelSelector.get_llm(AgentRole.SEASON_PLANNER)

    assert captured["max_tokens"] == 32000


def test_missing_key_raises(monkeypatch):
    monkeypatch.setattr(model_config, "get_config", lambda: Config())

    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        ModelSelector.get_llm(AgentRole.SYNTHESIS)


def test_unknown_override_fails_with_the_valid_names(monkeypatch):
    config = Config(anthropic_api_key="sk-ant-api03-test", tier_models={**TIER_MODEL, Tier.FAST: "gpt-9"})
    monkeypatch.setattr(model_config, "get_config", lambda: config)

    with pytest.raises(RuntimeError, match=r"Unknown model 'gpt-9'.*claude-haiku"):
        ModelSelector.get_llm(AgentRole.METRICS_SUMMARIZER)


def test_every_role_has_a_tier_and_every_tier_a_valid_default():
    assert set(ROLE_TIER) == set(AgentRole), "a role with no tier would fail at first use"
    assert set(TIER_MODEL) == set(Tier)
    unknown = set(TIER_MODEL.values()) - set(ModelSelector.CONFIGURATIONS)
    assert not unknown, f"tier defaults not in catalogue: {sorted(unknown)}"
