import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

from src.db import init, insert_thought, fetch_recent_replied


def _connect(db_path: Path) -> sqlite3.Connection:
    return sqlite3.connect(db_path)


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _iso_days_ago(n: int) -> str:
    return (datetime.now(tz=timezone.utc) - timedelta(days=n)).isoformat()


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
    init(db_path)

    with _connect(db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM thoughts").fetchone()[0]
        assert count == 0


def test_init_creates_parent_directories(tmp_path):
    db_path = tmp_path / "nested" / "dir" / "test.db"

    init(db_path)

    assert db_path.exists()


def test_init_schema_has_categorization_columns(tmp_path):
    db_path = tmp_path / "test.db"

    init(db_path)

    with _connect(db_path) as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(thoughts)")}
    expected = {
        "id", "prompt", "response", "sent_at", "responded_at", "status",
        "telegram_message_id",
        "mood",
        "goal1_clarity", "goal1_done_today", "goal1_good", "goal1_bad",
        "goal2_clarity", "goal2_done_today", "goal2_good", "goal2_bad",
        "goal3_clarity", "goal3_done_today", "goal3_good", "goal3_bad",
    }
    assert expected == cols


def test_insert_thought_replied_without_categorization(tmp_path):
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
            "SELECT prompt, response, mood, goal1_clarity FROM thoughts"
        ).fetchone()
    assert row == ("hello?", "i'm good", None, None)


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


def test_insert_thought_with_full_categorization(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="how's it going?",
        sent_at="2026-05-16T09:00:00+00:00",
        telegram_message_id=100,
        response="ran 5k, read 20 min",
        responded_at="2026-05-16T09:02:00+00:00",
        status="replied",
        mood="good",
        goal1_clarity=True,
        goal1_done_today=True,
        goal1_good="ran 5k",
        goal1_bad=None,
        goal2_clarity=True,
        goal2_done_today=True,
        goal2_good="read 20 min",
        goal2_bad="wanted 30",
        goal3_clarity=False,
        goal3_done_today=False,
        goal3_good=None,
        goal3_bad="forgot",
    )

    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT mood, goal1_clarity, goal1_done_today, goal1_good, "
            "goal2_bad, goal3_clarity FROM thoughts"
        ).fetchone()
    # Booleans round-trip as integers (sqlite has no native bool)
    assert row == ("good", 1, 1, "ran 5k", "wanted 30", 0)


def test_insert_thought_rejects_invalid_mood(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    with pytest.raises(sqlite3.IntegrityError):
        insert_thought(
            db_path,
            prompt="hi",
            sent_at="2026-05-16T09:00:00+00:00",
            telegram_message_id=200,
            response="ok",
            responded_at="2026-05-16T09:01:00+00:00",
            status="replied",
            mood="ecstatic",  # not in enum
        )


def test_fetch_recent_replied_empty_db(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    assert fetch_recent_replied(db_path, days=7) == []


def test_fetch_recent_replied_filters_by_days(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="recent",
        sent_at=_iso_days_ago(2),
        telegram_message_id=1,
        response="r",
        responded_at=_iso_days_ago(2),
        status="replied",
    )
    insert_thought(
        db_path,
        prompt="old",
        sent_at=_iso_days_ago(30),
        telegram_message_id=2,
        response="r",
        responded_at=_iso_days_ago(30),
        status="replied",
    )

    rows = fetch_recent_replied(db_path, days=7)

    assert len(rows) == 1
    assert rows[0]["prompt"] == "recent"


def test_fetch_recent_replied_excludes_timed_out(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="timed",
        sent_at=_iso_days_ago(1),
        telegram_message_id=1,
        response=None,
        responded_at=None,
        status="timed_out",
    )
    insert_thought(
        db_path,
        prompt="replied",
        sent_at=_iso_days_ago(1),
        telegram_message_id=2,
        response="ok",
        responded_at=_iso_days_ago(1),
        status="replied",
    )

    rows = fetch_recent_replied(db_path, days=7)

    assert len(rows) == 1
    assert rows[0]["prompt"] == "replied"


def test_fetch_recent_replied_returns_oldest_first(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="newer",
        sent_at=_iso_days_ago(1),
        telegram_message_id=2,
        response="r",
        responded_at=_iso_days_ago(1),
        status="replied",
    )
    insert_thought(
        db_path,
        prompt="older",
        sent_at=_iso_days_ago(5),
        telegram_message_id=1,
        response="r",
        responded_at=_iso_days_ago(5),
        status="replied",
    )

    rows = fetch_recent_replied(db_path, days=7)

    assert [r["prompt"] for r in rows] == ["older", "newer"]


def test_fetch_recent_replied_includes_categorization_columns(tmp_path):
    db_path = tmp_path / "test.db"
    init(db_path)

    insert_thought(
        db_path,
        prompt="cat row",
        sent_at=_iso_days_ago(1),
        telegram_message_id=1,
        response="ok",
        responded_at=_iso_days_ago(1),
        status="replied",
        mood="good",
        goal1_clarity=True,
        goal1_done_today=False,
        goal1_good=None,
        goal1_bad="meh",
    )

    rows = fetch_recent_replied(db_path, days=7)

    assert len(rows) == 1
    r = rows[0]
    assert r["mood"] == "good"
    assert r["goal1_clarity"] == 1
    assert r["goal1_done_today"] == 0
    assert r["goal1_bad"] == "meh"
