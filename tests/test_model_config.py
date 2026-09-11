import types

import pytest

from core.config import AIMode, Config
from services.ai import model_config
from services.ai.ai_settings import AgentRole, AISettings
from services.ai.model_config import OPENAI_BASE_URL, ModelSelector


class _StubSettings:
    def __init__(self, model_name: str):
        self.model_name = model_name

    def get_model_for_role(self, _: AgentRole) -> str:
        return self.model_name


def _capture_clients(monkeypatch):
    captured: dict = {}

    def fake_chat_anthropic(**kwargs):
        captured.update(kwargs)
        captured["client"] = "ChatAnthropic"
        return types.SimpleNamespace(**kwargs)

    def fake_chat_openai(**kwargs):
        captured.update(kwargs)
        captured["client"] = "ChatOpenAI"
        return types.SimpleNamespace(**kwargs)

    monkeypatch.setattr(model_config, "ChatAnthropic", fake_chat_anthropic)
    monkeypatch.setattr(model_config, "ChatOpenAI", fake_chat_openai)
    return captured


@pytest.mark.parametrize(
    ("model_name", "expected_client", "expected_model"),
    [
        ("claude-sonnet", "ChatAnthropic", "claude-sonnet-5"),
        ("claude-haiku", "ChatAnthropic", "claude-haiku-4-5-20251001"),
        ("gpt-5", "ChatOpenAI", "gpt-5.2"),
    ],
)
def test_routes_to_provider_client(monkeypatch, model_name, expected_client, expected_model):
    config = Config(
        anthropic_api_key="sk-ant-api03-test",
        openai_api_key="sk-test",
        ai_mode=AIMode.STANDARD,
    )
    monkeypatch.setattr(model_config, "get_config", lambda: config)
    monkeypatch.setattr(model_config, "ai_settings", _StubSettings(model_name))
    captured = _capture_clients(monkeypatch)

    ModelSelector.get_llm(AgentRole.SUMMARIZER)

    assert captured["client"] == expected_client
    assert captured["model"] == expected_model
    if expected_client == "ChatOpenAI":
        assert captured["api_key"] == "sk-test"
        assert captured["base_url"] == OPENAI_BASE_URL
    else:
        assert captured["api_key"] == "sk-ant-api03-test"
        assert "base_url" not in captured


def test_applies_per_model_params(monkeypatch):
    config = Config(openai_api_key="sk-test", ai_mode=AIMode.STANDARD)
    monkeypatch.setattr(model_config, "get_config", lambda: config)
    monkeypatch.setattr(model_config, "ai_settings", _StubSettings("gpt-5-search"))
    captured = _capture_clients(monkeypatch)

    ModelSelector.get_llm(AgentRole.SYNTHESIS)

    assert captured["use_responses_api"] is True
    assert captured["reasoning"] == {"effort": "xhigh"}
    assert captured["model_kwargs"]["tools"] == [{"type": "web_search"}]
    assert "log" not in captured


def test_missing_provider_key_raises(monkeypatch):
    config = Config(ai_mode=AIMode.STANDARD)
    monkeypatch.setattr(model_config, "get_config", lambda: config)
    monkeypatch.setattr(model_config, "ai_settings", _StubSettings("claude-sonnet"))

    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        ModelSelector.get_llm(AgentRole.SUMMARIZER)


def test_unknown_model_raises(monkeypatch):
    config = Config(anthropic_api_key="sk-ant-api03-test", ai_mode=AIMode.STANDARD)
    monkeypatch.setattr(model_config, "get_config", lambda: config)
    monkeypatch.setattr(model_config, "ai_settings", _StubSettings("not-a-model"))

    with pytest.raises(RuntimeError, match="Unknown model"):
        ModelSelector.get_llm(AgentRole.SUMMARIZER)


def test_every_assigned_model_exists_in_catalogue():
    # Guards the invariant the catalogue comment states: nothing in
    # ai_settings may reference a model that ModelSelector cannot build.
    assignments = AISettings(mode=AIMode.STANDARD).model_assignments
    assigned = {name for by_role in assignments.values() for name in by_role.values()}
    missing = assigned - set(ModelSelector.CONFIGURATIONS)
    assert not missing, f"assigned but not in catalogue: {sorted(missing)}"


def test_every_catalogue_model_is_assigned_somewhere():
    # And the converse: an entry nothing assigns is dead weight.
    assignments = AISettings(mode=AIMode.STANDARD).model_assignments
    assigned = {name for by_role in assignments.values() for name in by_role.values()}
    unused = set(ModelSelector.CONFIGURATIONS) - assigned
    assert not unused, f"in catalogue but never assigned: {sorted(unused)}"
