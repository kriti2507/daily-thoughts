"""SQLite persistence for thoughts. No knowledge of Telegram or LLM."""

import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional


_SCHEMA = """
CREATE TABLE IF NOT EXISTS thoughts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt              TEXT    NOT NULL,
    response            TEXT,
    sent_at             TEXT    NOT NULL,
    responded_at        TEXT,
    status              TEXT    NOT NULL CHECK (status IN ('replied','timed_out')),
    telegram_message_id INTEGER NOT NULL,
    mood                TEXT    CHECK (mood IS NULL OR mood IN ('good','bad','neutral')),
    goal1_clarity       INTEGER,
    goal1_done_today    INTEGER,
    goal1_good          TEXT,
    goal1_bad           TEXT,
    goal2_clarity       INTEGER,
    goal2_done_today    INTEGER,
    goal2_good          TEXT,
    goal2_bad           TEXT,
    goal3_clarity       INTEGER,
    goal3_done_today    INTEGER,
    goal3_good          TEXT,
    goal3_bad           TEXT
);
"""


def init(db_path: Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(_SCHEMA)


def insert_thought(
    db_path: Path,
    *,
    prompt: str,
    sent_at: str,
    telegram_message_id: int,
    response: Optional[str],
    responded_at: Optional[str],
    status: str,
    mood: Optional[str] = None,
    goal1_clarity: Optional[bool] = None,
    goal1_done_today: Optional[bool] = None,
    goal1_good: Optional[str] = None,
    goal1_bad: Optional[str] = None,
    goal2_clarity: Optional[bool] = None,
    goal2_done_today: Optional[bool] = None,
    goal2_good: Optional[str] = None,
    goal2_bad: Optional[str] = None,
    goal3_clarity: Optional[bool] = None,
    goal3_done_today: Optional[bool] = None,
    goal3_good: Optional[str] = None,
    goal3_bad: Optional[str] = None,
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO thoughts ("
            "prompt, response, sent_at, responded_at, status, telegram_message_id, "
            "mood, "
            "goal1_clarity, goal1_done_today, goal1_good, goal1_bad, "
            "goal2_clarity, goal2_done_today, goal2_good, goal2_bad, "
            "goal3_clarity, goal3_done_today, goal3_good, goal3_bad"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                prompt, response, sent_at, responded_at, status, telegram_message_id,
                mood,
                goal1_clarity, goal1_done_today, goal1_good, goal1_bad,
                goal2_clarity, goal2_done_today, goal2_good, goal2_bad,
                goal3_clarity, goal3_done_today, goal3_good, goal3_bad,
            ),
        )
        conn.commit()


def fetch_recent_replied(db_path: Path, days: int) -> list[dict]:
    """Return replied rows from the last `days` days, oldest -> newest, as dicts."""
    cutoff = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM thoughts "
            "WHERE status = 'replied' AND sent_at >= ? "
            "ORDER BY sent_at ASC",
            (cutoff,),
        ).fetchall()
        return [dict(r) for r in rows]
