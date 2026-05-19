"""LLM client: question generation and structured categorization.

Provider-agnostic protocol so a local-LLM backend can slot in later. Only
Anthropic is implemented in v2.
"""

from dataclasses import dataclass
from typing import Optional, Protocol

import anthropic

from src.goals import Goal


@dataclass(frozen=True)
class GoalCat:
    clarity: bool
    done_today: bool
    something_good: Optional[str]
    something_bad: Optional[str]


@dataclass(frozen=True)
class Categorization:
    mood: str  # 'good' | 'bad' | 'neutral'
    per_goal: dict[int, GoalCat]  # keys: 1, 2, 3


_MIN_HISTORY_FOR_REFLECTION = 3

_SYSTEM_QUESTION = (
    "You are a coaching assistant. The user is tracking three personal goals "
    "and you receive their last week of replies (with timestamps and per-goal "
    "categorization). Ask ONE focused question that (a) helps them reflect on "
    "a goal that needs attention based on recent trends and (b) is likely to "
    "elicit answers that fill the categorization fields (mood, per-goal "
    "clarity/done/something good/something bad). Keep it under 2 sentences. "
    "Output only the question text — no preamble, no quotes."
)

_SYSTEM_QUESTION_COLD_START = (
    "You are a coaching assistant. The user has just started tracking three "
    "personal goals and there isn't enough reply history yet to spot trends. "
    "Ask ONE focused, encouraging opening question tied to one specific goal "
    "that will help elicit a substantive first reply (mood, per-goal "
    "clarity/done/something good/something bad). Keep it under 2 sentences. "
    "Output only the question text — no preamble, no quotes."
)

_SYSTEM_CATEGORIZE = (
    "Read the user's reply and produce a structured categorization by calling "
    "the record_categorization tool. Be conservative: if a field is unclear "
    "from the reply, prefer the safer default (clarity=false, done_today=false, "
    "something_good=null, something_bad=null, mood='neutral'). Use the goals "
    "and recent history only as context."
)


def _format_goals(goals: list[Goal]) -> str:
    return "\n".join(
        f"Goal {g.index} — {g.title}: {g.description}" for g in goals
    )


def _format_history(history: list[dict]) -> str:
    if not history:
        return "(no replies in the recent window)"
    lines: list[str] = []
    for row in history:
        lines.append(
            f"- {row.get('sent_at')} mood={row.get('mood')} "
            f"done=[{row.get('goal1_done_today')},{row.get('goal2_done_today')},{row.get('goal3_done_today')}] "
            f"reply={row.get('response')!r}"
        )
    return "\n".join(lines)


_CATEGORIZATION_TOOL = {
    "name": "record_categorization",
    "description": (
        "Record a structured categorization of the user's reply across the "
        "three goals plus an overall mood. Use null for optional text fields "
        "when the reply doesn't mention something."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "mood": {
                "type": "string",
                "enum": ["good", "bad", "neutral"],
                "description": "Overall mood of the reply.",
            },
            "goal1_clarity": {"type": "boolean"},
            "goal1_done_today": {"type": "boolean"},
            "goal1_good": {"type": ["string", "null"]},
            "goal1_bad": {"type": ["string", "null"]},
            "goal2_clarity": {"type": "boolean"},
            "goal2_done_today": {"type": "boolean"},
            "goal2_good": {"type": ["string", "null"]},
            "goal2_bad": {"type": ["string", "null"]},
            "goal3_clarity": {"type": "boolean"},
            "goal3_done_today": {"type": "boolean"},
            "goal3_good": {"type": ["string", "null"]},
            "goal3_bad": {"type": ["string", "null"]},
        },
        "required": [
            "mood",
            "goal1_clarity", "goal1_done_today", "goal1_good", "goal1_bad",
            "goal2_clarity", "goal2_done_today", "goal2_good", "goal2_bad",
            "goal3_clarity", "goal3_done_today", "goal3_good", "goal3_bad",
        ],
    },
}


def _format_question_user(goals: list[Goal], history: list[dict]) -> str:
    return (
        "Goals:\n"
        f"{_format_goals(goals)}\n\n"
        "Recent replies (oldest first):\n"
        f"{_format_history(history)}\n\n"
        "Ask the next question."
    )


def _format_question_user_cold_start(goals: list[Goal]) -> str:
    return (
        "Goals:\n"
        f"{_format_goals(goals)}\n\n"
        "The user has just started tracking these goals — there isn't enough "
        "reply history yet. Pick one goal and ask an opening question."
    )


def _format_categorize_user(
    response: str, goals: list[Goal], history: list[dict]
) -> str:
    return (
        "Goals:\n"
        f"{_format_goals(goals)}\n\n"
        "Recent replies (oldest first):\n"
        f"{_format_history(history)}\n\n"
        "User's latest reply:\n"
        f"{response}\n\n"
        "Call record_categorization with your assessment."
    )


class LLMClient(Protocol):
    def generate_question(
        self, goals: list[Goal], history: list[dict]
    ) -> str: ...

    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization: ...


class AnthropicLLMClient:
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def _client(self) -> anthropic.Anthropic:
        return anthropic.Anthropic(api_key=self._api_key)

    def generate_question(
        self, goals: list[Goal], history: list[dict]
    ) -> str:
        if len(history) < _MIN_HISTORY_FOR_REFLECTION:
            system = _SYSTEM_QUESTION_COLD_START
            user = _format_question_user_cold_start(goals)
        else:
            system = _SYSTEM_QUESTION
            user = _format_question_user(goals, history)

        resp = self._client().messages.create(
            model=self._model,
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(
            getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text"
        )
        return text.strip()

    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization:
        resp = self._client().messages.create(
            model=self._model,
            max_tokens=1024,
            system=_SYSTEM_CATEGORIZE,
            tools=[_CATEGORIZATION_TOOL],
            tool_choice={"type": "tool", "name": "record_categorization"},
            messages=[
                {
                    "role": "user",
                    "content": _format_categorize_user(response, goals, history),
                }
            ],
        )
        tool_use = next(
            (b for b in resp.content if getattr(b, "type", None) == "tool_use"),
            None,
        )
        if tool_use is None:
            raise RuntimeError(
                "model did not call record_categorization tool"
            )
        data = tool_use.input
        per_goal = {
            i: GoalCat(
                clarity=bool(data[f"goal{i}_clarity"]),
                done_today=bool(data[f"goal{i}_done_today"]),
                something_good=data.get(f"goal{i}_good"),
                something_bad=data.get(f"goal{i}_bad"),
            )
            for i in (1, 2, 3)
        }
        return Categorization(mood=data["mood"], per_goal=per_goal)


def make_llm_client(config) -> LLMClient:
    if config.llm_provider == "anthropic":
        return AnthropicLLMClient(
            api_key=config.anthropic_api_key, model=config.llm_model
        )
    raise NotImplementedError(f"unknown LLM provider: {config.llm_provider}")
