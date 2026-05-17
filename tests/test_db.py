import sqlite3
from pathlib import Path

import pytest

from src.db import init, insert_thought


def _connect(db_path: Path) -> sqlite3.Connection:
    return sqlite3.connect(db_path)


def test_init_creates_thoughts_table(tmp_path):
    db_path = tmp_path / "test.db"

    init(db_path)

    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='thoughts'"
        ).fetchone()
        assert row is not None


def test_init_is_idempotent(tmp_path):
    db_path = tmp_path / "test.db"

    init(db_path)
    init(db_path)  # should not raise

    with _connect(db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM thoughts").fetchone()[0]
        assert count == 0


def test_init_creates_parent_directories(tmp_path):
    db_path = tmp_path / "nested" / "dir" / "test.db"

    init(db_path)

    assert db_path.exists()


def test_insert_thought_replied(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="hello?",
        sent_at="2026-05-16T09:00:00+00:00",
        telegram_message_id=42,
        response="i'm good",
        responded_at="2026-05-16T09:01:00+00:00",
        status="replied",
    )

    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT prompt, response, sent_at, responded_at, status, telegram_message_id "
            "FROM thoughts"
        ).fetchone()
    assert row == (
        "hello?",
        "i'm good",
        "2026-05-16T09:00:00+00:00",
        "2026-05-16T09:01:00+00:00",
        "replied",
        42,
    )


def test_insert_thought_timed_out(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="hello?",
        sent_at="2026-05-16T09:00:00+00:00",
        telegram_message_id=43,
        response=None,
        responded_at=None,
        status="timed_out",
    )

    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT response, responded_at, status FROM thoughts"
        ).fetchone()
    assert row == (None, None, "timed_out")


def test_insert_thought_rejects_invalid_status(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    with pytest.raises(sqlite3.IntegrityError):
        insert_thought(
            db_path,
            prompt="hello?",
            sent_at="2026-05-16T09:00:00+00:00",
            telegram_message_id=44,
            response=None,
            responded_at=None,
            status="bogus",
        )
