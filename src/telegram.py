"""Thin wrapper around the Telegram Bot API endpoints we use."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
import time

import requests


_API_BASE = "https://api.telegram.org"


@dataclass(frozen=True)
class Reply:
    text: str
    received_at: str  # ISO-8601 UTC


def _api_url(bot_token: str, method: str) -> str:
    return f"{_API_BASE}/bot{bot_token}/{method}"


def send_message(*, bot_token: str, chat_id: int, text: str) -> int:
    """Post a message to chat_id. Returns the bot's outgoing message_id."""
    resp = requests.post(
        _api_url(bot_token, "sendMessage"),
        json={"chat_id": chat_id, "text": text},
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(
            f"Telegram sendMessage failed: {body.get('description', 'unknown error')}"
        )
    return int(body["result"]["message_id"])
