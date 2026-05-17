"""SQLite persistence for thoughts. No knowledge of Telegram."""

import sqlite3
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
    telegram_message_id INTEGER NOT NULL
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
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO thoughts "
            "(prompt, response, sent_at, responded_at, status, telegram_message_id) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (prompt, response, sent_at, responded_at, status, telegram_message_id),
        )
        conn.commit()
