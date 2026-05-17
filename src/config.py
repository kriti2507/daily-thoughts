"""Config loading. Single source of truth for env-driven settings."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values


_REQUIRED_KEYS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "REPLY_TIMEOUT_SECONDS",
    "DB_PATH",
    "GOALS_PATH",
    "HISTORY_DAYS",
    "LLM_PROVIDER",
    "LLM_MODEL",
)


@dataclass(frozen=True)
class Config:
    telegram_bot_token: str
    telegram_chat_id: int
    reply_timeout_seconds: int
    db_path: Path
    goals_path: Path
    history_days: int
    llm_provider: str
    llm_model: str
    anthropic_api_key: Optional[str]


def load_config(env_path: Path) -> Config:
    env_path = Path(env_path)
    if not env_path.exists():
        raise FileNotFoundError(f"env file not found: {env_path}")

    values = dotenv_values(env_path)

    missing = [k for k in _REQUIRED_KEYS if not values.get(k)]
    if missing:
        raise ValueError(f"Missing required env keys: {', '.join(missing)}")

    try:
        chat_id = int(values["TELEGRAM_CHAT_ID"])
    except ValueError as exc:
        raise ValueError(
            f"TELEGRAM_CHAT_ID must be an integer, got: {values['TELEGRAM_CHAT_ID']!r}"
        ) from exc

    try:
        timeout = int(values["REPLY_TIMEOUT_SECONDS"])
    except ValueError as exc:
        raise ValueError(
            f"REPLY_TIMEOUT_SECONDS must be an integer, got: {values['REPLY_TIMEOUT_SECONDS']!r}"
        ) from exc

    try:
        history_days = int(values["HISTORY_DAYS"])
    except ValueError as exc:
        raise ValueError(
            f"HISTORY_DAYS must be an integer, got: {values['HISTORY_DAYS']!r}"
        ) from exc

    provider = values["LLM_PROVIDER"].strip().lower()
    anthropic_key = values.get("ANTHROPIC_API_KEY") or None
    if provider == "anthropic" and not anthropic_key:
        raise ValueError(
            "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic"
        )

    return Config(
        telegram_bot_token=values["TELEGRAM_BOT_TOKEN"],
        telegram_chat_id=chat_id,
        reply_timeout_seconds=timeout,
        db_path=Path(values["DB_PATH"]),
        goals_path=Path(values["GOALS_PATH"]),
        history_days=history_days,
        llm_provider=provider,
        llm_model=values["LLM_MODEL"],
        anthropic_api_key=anthropic_key,
    )
