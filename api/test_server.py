import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def db_path(tmp_path):
    db = tmp_path / "thoughts.db"
    conn = sqlite3.connect(db)
    conn.executescript("""
        CREATE TABLE thoughts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            response TEXT,
            sent_at TEXT NOT NULL,
            responded_at TEXT,
            status TEXT NOT NULL,
            telegram_message_id INTEGER NOT NULL,
            mood TEXT,
            goal1_clarity INTEGER, goal1_done_today INTEGER,
            goal1_good TEXT, goal1_bad TEXT,
            goal2_clarity INTEGER, goal2_done_today INTEGER,
            goal2_good TEXT, goal2_bad TEXT,
            goal3_clarity INTEGER, goal3_done_today INTEGER,
            goal3_good TEXT, goal3_bad TEXT
        );
    """)
    conn.close()
    return db


@pytest.fixture()
def client(db_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(db_path))
    import importlib
    import server
    importlib.reload(server)
    return TestClient(server.app)


def _insert(db_path, *, sent_at, status="replied", mood="good",
            response="test", responded_at=None, prompt="How are you?",
            g1_clarity=7, g1_done=1, g1_good="did stuff", g1_bad=None,
            g2_clarity=5, g2_done=0, g2_good=None, g2_bad="nothing",
            g3_clarity=8, g3_done=1, g3_good="ran", g3_bad=None):
    if responded_at is None:
        responded_at = sent_at
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO thoughts (prompt, response, sent_at, responded_at, "
        "status, telegram_message_id, mood, "
        "goal1_clarity, goal1_done_today, goal1_good, goal1_bad, "
        "goal2_clarity, goal2_done_today, goal2_good, goal2_bad, "
        "goal3_clarity, goal3_done_today, goal3_good, goal3_bad) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (prompt, response, sent_at, responded_at, status, 1, mood,
         g1_clarity, g1_done, g1_good, g1_bad,
         g2_clarity, g2_done, g2_good, g2_bad,
         g3_clarity, g3_done, g3_good, g3_bad),
    )
    conn.commit()
    conn.close()


class TestToday:
    def test_returns_null_when_no_entry(self, client):
        resp = client.get("/api/today")
        assert resp.status_code == 200
        assert resp.json() is None

    def test_returns_todays_entry(self, client, db_path):
        from datetime import datetime, timezone
        today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT10:00:00+00:00")
        _insert(db_path, sent_at=today, mood="good", response="feeling great")
        resp = client.get("/api/today")
        data = resp.json()
        assert data["mood"] == "good"
        assert data["response"] == "feeling great"
        assert data["goals"]["goal1"]["clarity"] == 7
        assert data["goals"]["goal2"]["done_today"] is False
        assert data["goals"]["goal3"]["good"] == "ran"

    def test_ignores_timed_out(self, client, db_path):
        from datetime import datetime, timezone
        today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT10:00:00+00:00")
        _insert(db_path, sent_at=today, status="timed_out", response=None)
        resp = client.get("/api/today")
        assert resp.json() is None

    def test_ignores_yesterday(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        yesterday = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT10:00:00+00:00"
        )
        _insert(db_path, sent_at=yesterday)
        resp = client.get("/api/today")
        assert resp.json() is None
