"""Entry point. One run: load config + goals -> generate -> send -> poll
-> categorize -> insert."""

import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

from src import db, telegram
from src.config import load_config
from src.goals import load_goals
from src.llm import Categorization, make_llm_client


def _now_iso_utc() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _cat_to_kwargs(cat: Categorization) -> dict:
    return {
        "mood": cat.mood,
        "goal1_clarity": cat.per_goal[1].clarity,
        "goal1_done_today": cat.per_goal[1].done_today,
        "goal1_good": cat.per_goal[1].something_good,
        "goal1_bad": cat.per_goal[1].something_bad,
        "goal2_clarity": cat.per_goal[2].clarity,
        "goal2_done_today": cat.per_goal[2].done_today,
        "goal2_good": cat.per_goal[2].something_good,
        "goal2_bad": cat.per_goal[2].something_bad,
        "goal3_clarity": cat.per_goal[3].clarity,
        "goal3_done_today": cat.per_goal[3].done_today,
        "goal3_good": cat.per_goal[3].something_good,
        "goal3_bad": cat.per_goal[3].something_bad,
    }


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    env_path = repo_root / ".env"

    try:
        config = load_config(env_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 1

    goals_path = config.goals_path
    if not goals_path.is_absolute():
        goals_path = repo_root / goals_path

    try:
        goals = load_goals(goals_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"goals error: {exc}", file=sys.stderr)
        return 1

    db_path = config.db_path
    if not db_path.is_absolute():
        db_path = repo_root / db_path

    try:
        db.init(db_path)
    except Exception as exc:
        print(f"db init failed: {exc}", file=sys.stderr)
        return 1

    history = db.fetch_recent_replied(db_path, days=config.history_days)

    try:
        llm_client = make_llm_client(config)
        prompt = llm_client.generate_question(goals, history)
    except Exception as exc:
        # Skip the run — nothing sent, nothing stored. Averaging over 7 days
        # absorbs the missed run.
        print(f"generate_question failed: {exc}", file=sys.stderr)
        return 0

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
    except Exception:
        traceback.print_exc(file=sys.stderr)
        reply = None

    cat_kwargs: dict = {}
    if reply is not None:
        try:
            categorization = llm_client.categorize(reply.text, goals, history)
            cat_kwargs = _cat_to_kwargs(categorization)
        except Exception as exc:
            # Categorization failure: store the reply text but leave fields NULL.
            print(f"categorize failed: {exc}", file=sys.stderr)
            cat_kwargs = {}

    try:
        if reply is not None:
            db.insert_thought(
                db_path,
                prompt=prompt,
                sent_at=sent_at,
                telegram_message_id=msg_id,
                response=reply.text,
                responded_at=reply.received_at,
                status="replied",
                **cat_kwargs,
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
    except Exception as exc:
        print(f"db write failed: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
