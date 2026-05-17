from unittest.mock import patch, MagicMock

import pytest

from src.llm import (
    Categorization,
    GoalCat,
    AnthropicLLMClient,
    make_llm_client,
)
from src.goals import Goal


def _goals() -> list[Goal]:
    return [
        Goal(index=1, title="Run", description="Run more"),
        Goal(index=2, title="Read", description="Read daily"),
        Goal(index=3, title="Meditate", description="Daily 10 min"),
    ]


def _text_block(text: str) -> MagicMock:
    b = MagicMock()
    b.type = "text"
    b.text = text
    return b


def _tool_use_block(input_data: dict) -> MagicMock:
    b = MagicMock()
    b.type = "tool_use"
    b.name = "record_categorization"
    b.input = input_data
    return b


# ---------- Dataclasses ----------

def test_goal_cat_is_frozen():
    g = GoalCat(clarity=True, done_today=False, something_good=None, something_bad=None)
    with pytest.raises(Exception):
        g.clarity = False  # type: ignore[misc]


def test_categorization_is_frozen():
    c = Categorization(mood="good", per_goal={1: GoalCat(True, True, None, None)})
    with pytest.raises(Exception):
        c.mood = "bad"  # type: ignore[misc]


# ---------- Factory ----------

class _DummyConfig:
    llm_provider = "anthropic"
    llm_model = "claude-test"
    anthropic_api_key = "sk-test"


class _UnknownConfig:
    llm_provider = "local"
    llm_model = "llama"
    anthropic_api_key = None


def test_make_llm_client_returns_anthropic_client_for_anthropic_provider():
    client = make_llm_client(_DummyConfig())
    assert isinstance(client, AnthropicLLMClient)


def test_make_llm_client_raises_not_implemented_for_unknown_provider():
    with pytest.raises(NotImplementedError, match="local"):
        make_llm_client(_UnknownConfig())


# ---------- generate_question ----------

@patch("src.llm.anthropic.Anthropic")
def test_generate_question_returns_text_from_response(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("What did you read today?")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    result = client.generate_question(_goals(), [])

    assert result == "What did you read today?"


@patch("src.llm.anthropic.Anthropic")
def test_generate_question_passes_model_and_system_prompt(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("Q?")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    client.generate_question(_goals(), [])

    call = mock_inst.messages.create.call_args
    assert call.kwargs["model"] == "claude-test"
    assert "coaching" in call.kwargs["system"].lower() or "goal" in call.kwargs["system"].lower()
    # User message should mention each goal title at least once
    user_content = call.kwargs["messages"][0]["content"]
    assert "Run" in user_content
    assert "Read" in user_content
    assert "Meditate" in user_content


@patch("src.llm.anthropic.Anthropic")
def test_generate_question_includes_history_in_user_message(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("Q?")]
    mock_inst.messages.create.return_value = mock_response

    history = [
        {
            "sent_at": "2026-05-15T09:00:00+00:00",
            "response": "ran 5k yesterday",
            "mood": "good",
            "goal1_done_today": 1,
            "goal2_done_today": 0,
            "goal3_done_today": 1,
            "goal1_clarity": 1,
            "goal1_good": "5k done",
            "goal1_bad": None,
            "goal2_clarity": 1,
            "goal2_good": None,
            "goal2_bad": "skipped reading",
            "goal3_clarity": 1,
            "goal3_good": "ten minutes",
            "goal3_bad": None,
            "prompt": "How's it going?",
        }
    ]

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    client.generate_question(_goals(), history)

    user_content = mock_inst.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "ran 5k yesterday" in user_content


@patch("src.llm.anthropic.Anthropic")
def test_generate_question_strips_whitespace_from_result(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("  Padded question  \n")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    result = client.generate_question(_goals(), [])

    assert result == "Padded question"
