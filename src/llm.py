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


_SYSTEM_QUESTION = (
    "You are a coaching assistant. The user is tracking three personal goals "
    "and you receive their last week of replies (with timestamps and per-goal "
    "categorization). Ask ONE focused question that (a) helps them reflect on "
    "a goal that needs attention based on recent trends and (b) is likely to "
    "elicit answers that fill the categorization fields (mood, per-goal "
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


def _format_question_user(goals: list[Goal], history: list[dict]) -> str:
    return (
        "Goals:\n"
        f"{_format_goals(goals)}\n\n"
        "Recent replies (oldest first):\n"
        f"{_format_history(history)}\n\n"
        "Ask the next question."
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
        resp = self._client().messages.create(
            model=self._model,
            max_tokens=300,
            system=_SYSTEM_QUESTION,
            messages=[
                {"role": "user", "content": _format_question_user(goals, history)}
            ],
        )
        text = "".join(
            getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text"
        )
        return text.strip()

    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization:
        raise NotImplementedError("categorize is implemented in the next task")


def make_llm_client(config) -> LLMClient:
    if config.llm_provider == "anthropic":
        return AnthropicLLMClient(
            api_key=config.anthropic_api_key, model=config.llm_model
        )
    raise NotImplementedError(f"unknown LLM provider: {config.llm_provider}")
