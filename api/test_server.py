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
        assert data["prompt"] == "How are you?"
        assert data["mood"] == "good"
        assert data["response"] == "feeling great"
        assert data["sent_at"] == today
        assert data["responded_at"] == today
        assert data["goals"]["goal1"]["name"] == "AI Expert"
        assert data["goals"]["goal1"]["clarity"] == 7
        assert data["goals"]["goal2"]["name"] == "Substack and Instagram"
        assert data["goals"]["goal2"]["done_today"] is False
        assert data["goals"]["goal3"]["name"] == "Health"
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


class TestStats:
    def test_empty_db(self, client):
        resp = client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["streak"] == 0
        assert data["streak_is_best"] is False
        assert data["total_entries"] == 0
        assert data["mood_counts_7d"] == {"good": 0, "neutral": 0, "bad": 0}
        assert data["goal_clarity_avg_7d"]["goal1"]["avg"] == 0
        assert data["goal_clarity_avg_7d"]["goal2"]["avg"] == 0
        assert data["goal_clarity_avg_7d"]["goal3"]["avg"] == 0
        assert len(data["weekly_moods"]) == 7

    def test_streak_counts_consecutive_days(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(tz=timezone.utc)
        for offset in range(3):
            day = today - timedelta(days=offset)
            sent = day.strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=sent)
        resp = client.get("/api/stats")
        assert resp.json()["streak"] == 3

    def test_streak_breaks_on_gap(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(tz=timezone.utc)
        # Insert today, yesterday, and 3 days ago (gap at 2 days ago)
        for offset in [0, 1, 3]:
            day = today - timedelta(days=offset)
            sent = day.strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=sent)
        resp = client.get("/api/stats")
        assert resp.json()["streak"] == 2

    def test_streak_is_best(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(tz=timezone.utc)
        for offset in range(2):
            day = today - timedelta(days=offset)
            sent = day.strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=sent)
        resp = client.get("/api/stats")
        data = resp.json()
        assert data["streak"] == 2
        assert data["streak_is_best"] is True

    def test_mood_counts_7d(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=today.strftime("%Y-%m-%dT10:00:00+00:00"), mood="good")
        yesterday = today - timedelta(days=1)
        _insert(db_path, sent_at=yesterday.strftime("%Y-%m-%dT10:00:00+00:00"), mood="good")
        two_days_ago = today - timedelta(days=2)
        _insert(db_path, sent_at=two_days_ago.strftime("%Y-%m-%dT10:00:00+00:00"), mood="bad")
        resp = client.get("/api/stats")
        counts = resp.json()["mood_counts_7d"]
        assert counts["good"] == 2
        assert counts["bad"] == 1
        assert counts["neutral"] == 0

    def test_goal_clarity_avg_7d(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(tz=timezone.utc)
        yesterday = today - timedelta(days=1)
        _insert(db_path, sent_at=today.strftime("%Y-%m-%dT10:00:00+00:00"), g1_clarity=6)
        _insert(db_path, sent_at=yesterday.strftime("%Y-%m-%dT10:00:00+00:00"), g1_clarity=8)
        resp = client.get("/api/stats")
        avg = resp.json()["goal_clarity_avg_7d"]["goal1"]["avg"]
        assert avg == 7.0

    def test_total_entries(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(tz=timezone.utc)
        for offset in range(4):
            day = today - timedelta(days=offset)
            _insert(db_path, sent_at=day.strftime("%Y-%m-%dT10:00:00+00:00"))
        resp = client.get("/api/stats")
        assert resp.json()["total_entries"] == 4

    def test_weekly_moods_structure(self, client, db_path):
        from datetime import datetime, timezone
        today = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=today.strftime("%Y-%m-%dT10:00:00+00:00"), mood="good")
        resp = client.get("/api/stats")
        weekly = resp.json()["weekly_moods"]
        assert len(weekly) == 7
        for item in weekly:
            assert "date" in item
            assert "mood" in item
