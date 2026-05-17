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


def _to_iso_utc(unix_ts: int) -> str:
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()


def _get_updates(bot_token: str, *, offset: int, long_poll_seconds: int) -> list:
    """One getUpdates call. Returns the raw `result` list."""
    resp = requests.get(
        _api_url(bot_token, "getUpdates"),
        params={"offset": offset, "timeout": long_poll_seconds},
        timeout=long_poll_seconds + 10,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(
            f"Telegram getUpdates failed: {body.get('description', 'unknown error')}"
        )
    return body["result"]


def _drain_offset(bot_token: str) -> int:
    """Return an offset past all currently-pending updates."""
    # offset=-1 returns at most the latest pending update without consuming earlier ones.
    # Using its update_id + 1 as the next offset effectively skips all current pending.
    result = _get_updates(bot_token, offset=-1, long_poll_seconds=0)
    if not result:
        return 0
    return int(result[-1]["update_id"]) + 1


_LONG_POLL_SECONDS = 50
_MAX_TRANSIENT_RETRIES = 3
_RETRY_BACKOFF_SECONDS = 2


def poll_for_reply(
    *,
    bot_token: str,
    reply_to_message_id: int,
    timeout_seconds: int,
) -> Optional[Reply]:
    """
    Long-poll Telegram for a message whose reply_to_message.message_id matches.
    Returns None on timeout. Drains pre-existing updates before polling.
    """
    deadline_start = time.monotonic()
    offset = _drain_offset(bot_token)

    transient_failures = 0

    while True:
        elapsed = time.monotonic() - deadline_start
        remaining = timeout_seconds - elapsed
        if remaining <= 0:
            return None

        per_call = min(_LONG_POLL_SECONDS, max(1, int(remaining)))

        try:
            updates = _get_updates(
                bot_token, offset=offset, long_poll_seconds=per_call
            )
            transient_failures = 0
        except requests.RequestException:
            transient_failures += 1
            if transient_failures > _MAX_TRANSIENT_RETRIES:
                raise
            time.sleep(_RETRY_BACKOFF_SECONDS)
            continue

        for update in updates:
            offset = max(offset, int(update["update_id"]) + 1)
            message = update.get("message")
            if not message:
                continue
            replied_to = message.get("reply_to_message")
            if not replied_to:
                continue
            if int(replied_to.get("message_id", -1)) != reply_to_message_id:
                continue
            return Reply(
                text=message.get("text", ""),
                received_at=_to_iso_utc(int(message["date"])),
            )
