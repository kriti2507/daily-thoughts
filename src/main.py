"""Entry point. One run: load config -> generate -> send -> poll -> insert."""

import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

from src import db, telegram
from src.config import load_config
from src.prompts import generate_prompt


def _now_iso_utc() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    env_path = repo_root / ".env"

    try:
        config = load_config(env_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 1

    db_path = config.db_path
    if not db_path.is_absolute():
        db_path = repo_root / db_path

    try:
        db.init(db_path)
    except Exception as exc:
        print(f"db init failed: {exc}", file=sys.stderr)
        return 1

    prompt = generate_prompt()
    sent_at = _now_iso_utc()

    try:
        msg_id = telegram.send_message(
            bot_token=config.telegram_bot_token,
            chat_id=config.telegram_chat_id,
            text=prompt,
        )
    except Exception as exc:
        print(f"sendMessage failed: {exc}", file=sys.stderr)
        return 1

    try:
        reply = telegram.poll_for_reply(
            bot_token=config.telegram_bot_token,
            reply_to_message_id=msg_id,
            timeout_seconds=config.reply_timeout_seconds,
        )
    except Exception as exc:
        # Persistent polling failure — record as timed_out so the prompt isn't lost.
        traceback.print_exc(file=sys.stderr)
        reply = None

    if reply is not None:
        db.insert_thought(
            db_path,
            prompt=prompt,
            sent_at=sent_at,
            telegram_message_id=msg_id,
            response=reply.text,
            responded_at=reply.received_at,
            status="replied",
        )
    else:
        db.insert_thought(
            db_path,
            prompt=prompt,
            sent_at=sent_at,
            telegram_message_id=msg_id,
            response=None,
            responded_at=None,
            status="timed_out",
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
