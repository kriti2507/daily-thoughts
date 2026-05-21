# Daily Thoughts Frontend Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bento-grid dashboard (Next.js + shadcn/ui + Tremor) backed by a read-only FastAPI server that reads from the existing `data/thoughts.db`.

**Architecture:** A FastAPI server (`api/server.py`) exposes 3 read-only GET endpoints that query the existing SQLite database. A Next.js app (`frontend/`) fetches from these endpoints and renders a 6-tile responsive bento-grid dashboard with auto dark/light theming. The existing Python pipeline (cron + Telegram + LLM) is untouched.

**Tech Stack:** Python 3.13 + FastAPI + uvicorn (API), Node 25 + Next.js 15 + React 19 + shadcn/ui + Tremor + Tailwind CSS (frontend)

---

## File Structure

### New files — API (`api/`)

| File | Responsibility |
|------|---------------|
| `api/requirements.txt` | FastAPI + uvicorn dependencies |
| `api/server.py` | FastAPI app with 3 endpoints: `/api/today`, `/api/stats`, `/api/entries` |
| `api/test_server.py` | API integration tests using FastAPI TestClient |

### New files — Frontend (`frontend/`)

| File | Responsibility |
|------|---------------|
| `frontend/package.json` | Next.js project config and scripts |
| `frontend/next.config.ts` | Next.js config with API proxy rewrite |
| `frontend/tsconfig.json` | TypeScript config |
| `frontend/tailwind.config.ts` | Tailwind CSS config with shadcn/ui presets |
| `frontend/postcss.config.mjs` | PostCSS config for Tailwind |
| `frontend/components.json` | shadcn/ui component config |
| `frontend/src/app/layout.tsx` | Root layout: fonts, theme provider, metadata |
| `frontend/src/app/page.tsx` | Dashboard page — assembles the 6-tile bento grid |
| `frontend/src/app/globals.css` | Tailwind directives + shadcn/ui CSS variables |
| `frontend/src/lib/utils.ts` | shadcn/ui `cn()` utility |
| `frontend/src/lib/api.ts` | Typed fetch wrappers for the 3 API endpoints |
| `frontend/src/components/theme-provider.tsx` | next-themes wrapper for dark/light mode |
| `frontend/src/components/theme-toggle.tsx` | Moon/sun toggle button |
| `frontend/src/components/ui/` | shadcn/ui primitives (card, button, badge, progress) |
| `frontend/src/components/dashboard/today-mood.tsx` | Tile 1: hero mood display |
| `frontend/src/components/dashboard/streak.tsx` | Tile 2: streak counter |
| `frontend/src/components/dashboard/weekly-mood.tsx` | Tile 3: 7-day emoji grid |
| `frontend/src/components/dashboard/goal-clarity.tsx` | Tile 4: 3 progress bars |
| `frontend/src/components/dashboard/mood-chart.tsx` | Tile 5: Tremor bar chart |
| `frontend/src/components/dashboard/recent-entries.tsx` | Tile 6: scrollable entry list |

### Existing files — No modifications

The existing `src/`, `tests/`, `data/thoughts.db`, `goals.md`, `requirements.txt` are NOT touched.

---

## Task 1: FastAPI Server — Project Setup & `/api/today` Endpoint

**Files:**
- Create: `api/requirements.txt`
- Create: `api/server.py`
- Create: `api/test_server.py`

### Database context

The existing `data/thoughts.db` has this schema (defined in `src/db.py`):

```sql
CREATE TABLE thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    response TEXT,
    sent_at TEXT NOT NULL,        -- ISO 8601
    responded_at TEXT,             -- ISO 8601 or NULL
    status TEXT NOT NULL CHECK (status IN ('replied','timed_out')),
    telegram_message_id INTEGER NOT NULL,
    mood TEXT CHECK (mood IS NULL OR mood IN ('good','bad','neutral')),
    goal1_clarity INTEGER,         -- 0-10 scale (stored as int)
    goal1_done_today INTEGER,      -- 0 or 1 (boolean)
    goal1_good TEXT,
    goal1_bad TEXT,
    goal2_clarity INTEGER,
    goal2_done_today INTEGER,
    goal2_good TEXT,
    goal2_bad TEXT,
    goal3_clarity INTEGER,
    goal3_done_today INTEGER,
    goal3_good TEXT,
    goal3_bad TEXT
);
```

The 3 goals (from `goals.md`) are:
1. AI Expert
2. Substack and Instagram
3. Health

- [ ] **Step 1: Create `api/requirements.txt`**

```
fastapi>=0.115
uvicorn>=0.34
pytest>=8.0
httpx>=0.28
```

- [ ] **Step 2: Install API dependencies**

Run:
```bash
cd api && python3 -m pip install -r requirements.txt
```

- [ ] **Step 3: Write the test for `/api/today`**

Create `api/test_server.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run:
```bash
cd api && python3 -m pytest test_server.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 5: Implement `api/server.py` with `/api/today`**

```python
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DB_PATH = Path(os.environ.get("DB_PATH", "../data/thoughts.db"))

app = FastAPI(title="Daily Thoughts API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

GOAL_NAMES = ["AI Expert", "Substack and Instagram", "Health"]


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_goals(row):
    goals = {}
    for i in range(1, 4):
        prefix = f"goal{i}"
        goals[prefix] = {
            "name": GOAL_NAMES[i - 1],
            "clarity": row[f"{prefix}_clarity"],
            "done_today": bool(row[f"{prefix}_done_today"]) if row[f"{prefix}_done_today"] is not None else None,
            "good": row[f"{prefix}_good"],
            "bad": row[f"{prefix}_bad"],
        }
    return goals


@app.get("/api/today")
def get_today():
    today_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM thoughts WHERE status = 'replied' AND sent_at LIKE ? "
        "ORDER BY sent_at DESC LIMIT 1",
        (f"{today_str}%",),
    ).fetchone()
    conn.close()
    if row is None:
        return None
    return {
        "prompt": row["prompt"],
        "response": row["response"],
        "mood": row["mood"],
        "sent_at": row["sent_at"],
        "responded_at": row["responded_at"],
        "goals": _row_to_goals(row),
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd api && python3 -m pytest test_server.py::TestToday -v
```

Expected: All 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add api/requirements.txt api/server.py api/test_server.py
git commit -m "feat(api): add FastAPI server with /api/today endpoint"
```

---

## Task 2: FastAPI — `/api/stats` Endpoint

**Files:**
- Modify: `api/server.py`
- Modify: `api/test_server.py`

- [ ] **Step 1: Write tests for `/api/stats`**

Append to `api/test_server.py`:

```python
class TestStats:
    def test_empty_db(self, client):
        resp = client.get("/api/stats")
        data = resp.json()
        assert data["streak"] == 0
        assert data["streak_is_best"] is False
        assert data["total_entries"] == 0
        assert data["mood_counts_7d"] == {"good": 0, "neutral": 0, "bad": 0}
        assert len(data["weekly_moods"]) == 7

    def test_streak_counts_consecutive_days(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        for days_ago in [0, 1, 2]:
            d = (now - timedelta(days=days_ago)).strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=d)
        resp = client.get("/api/stats")
        assert resp.json()["streak"] == 3

    def test_streak_breaks_on_gap(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        for days_ago in [0, 1, 3]:  # gap at day 2
            d = (now - timedelta(days=days_ago)).strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=d)
        resp = client.get("/api/stats")
        assert resp.json()["streak"] == 2

    def test_streak_is_best(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        for days_ago in [0, 1, 2]:
            d = (now - timedelta(days=days_ago)).strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=d)
        resp = client.get("/api/stats")
        assert resp.json()["streak_is_best"] is True

    def test_mood_counts_7d(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=(now - timedelta(days=1)).strftime("%Y-%m-%dT10:00:00+00:00"), mood="good")
        _insert(db_path, sent_at=(now - timedelta(days=2)).strftime("%Y-%m-%dT10:00:00+00:00"), mood="good")
        _insert(db_path, sent_at=(now - timedelta(days=3)).strftime("%Y-%m-%dT10:00:00+00:00"), mood="bad")
        resp = client.get("/api/stats")
        counts = resp.json()["mood_counts_7d"]
        assert counts == {"good": 2, "neutral": 0, "bad": 1}

    def test_goal_clarity_avg_7d(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=(now - timedelta(days=1)).strftime("%Y-%m-%dT10:00:00+00:00"), g1_clarity=8)
        _insert(db_path, sent_at=(now - timedelta(days=2)).strftime("%Y-%m-%dT10:00:00+00:00"), g1_clarity=6)
        resp = client.get("/api/stats")
        avg = resp.json()["goal_clarity_avg_7d"]
        assert avg["goal1"]["name"] == "AI Expert"
        assert avg["goal1"]["avg"] == 7.0

    def test_total_entries(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        for i in range(5):
            d = (now - timedelta(days=i)).strftime("%Y-%m-%dT10:00:00+00:00")
            _insert(db_path, sent_at=d)
        resp = client.get("/api/stats")
        assert resp.json()["total_entries"] == 5

    def test_weekly_moods_structure(self, client, db_path):
        from datetime import datetime, timezone
        today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT10:00:00+00:00")
        _insert(db_path, sent_at=today, mood="good")
        resp = client.get("/api/stats")
        weekly = resp.json()["weekly_moods"]
        assert len(weekly) == 7
        assert all("date" in day and "mood" in day for day in weekly)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd api && python3 -m pytest test_server.py::TestStats -v
```

Expected: FAIL — `starlette.routing.NoMatchFound` (404)

- [ ] **Step 3: Implement `/api/stats` in `api/server.py`**

Add below the `/api/today` endpoint:

```python
from datetime import timedelta


def _compute_streak(conn) -> tuple[int, bool]:
    rows = conn.execute(
        "SELECT DISTINCT date(sent_at) as d FROM thoughts "
        "WHERE status = 'replied' ORDER BY d DESC"
    ).fetchall()
    if not rows:
        return 0, False

    dates = [datetime.strptime(r["d"], "%Y-%m-%d").date() for r in rows]
    today = datetime.now(tz=timezone.utc).date()

    if dates[0] != today and dates[0] != today - timedelta(days=1):
        current_streak = 0
    else:
        current_streak = 1
        for i in range(1, len(dates)):
            if dates[i] == dates[i - 1] - timedelta(days=1):
                current_streak += 1
            else:
                break

    # Find best streak
    best = 1
    run = 1
    for i in range(1, len(dates)):
        if dates[i] == dates[i - 1] - timedelta(days=1):
            run += 1
            best = max(best, run)
        else:
            run = 1

    return current_streak, current_streak >= best and current_streak > 0


@app.get("/api/stats")
def get_stats():
    conn = _get_db()

    streak, streak_is_best = _compute_streak(conn)

    # Total entries
    total = conn.execute(
        "SELECT COUNT(*) FROM thoughts WHERE status = 'replied'"
    ).fetchone()[0]

    # Mood counts last 7 days
    cutoff_7d = (datetime.now(tz=timezone.utc) - timedelta(days=7)).isoformat()
    rows_7d = conn.execute(
        "SELECT mood FROM thoughts WHERE status = 'replied' AND sent_at >= ?",
        (cutoff_7d,),
    ).fetchall()
    mood_counts = {"good": 0, "neutral": 0, "bad": 0}
    for r in rows_7d:
        if r["mood"] in mood_counts:
            mood_counts[r["mood"]] += 1

    # Goal clarity averages (last 7 days)
    goal_clarity_avg_7d = {}
    rows_clarity = conn.execute(
        "SELECT goal1_clarity, goal2_clarity, goal3_clarity FROM thoughts "
        "WHERE status = 'replied' AND sent_at >= ?",
        (cutoff_7d,),
    ).fetchall()

    for i in range(1, 4):
        key = f"goal{i}"
        values = [r[f"{key}_clarity"] for r in rows_clarity if r[f"{key}_clarity"] is not None]
        avg = round(sum(values) / len(values), 1) if values else 0
        goal_clarity_avg_7d[key] = {"name": GOAL_NAMES[i - 1], "avg": avg}

    # Goal clarity trend (compare last 7 days vs prior 7 days)
    cutoff_14d = (datetime.now(tz=timezone.utc) - timedelta(days=14)).isoformat()
    rows_prior = conn.execute(
        "SELECT goal1_clarity, goal2_clarity, goal3_clarity FROM thoughts "
        "WHERE status = 'replied' AND sent_at >= ? AND sent_at < ?",
        (cutoff_14d, cutoff_7d),
    ).fetchall()

    goal_clarity_trend = {}
    for i in range(1, 4):
        key = f"goal{i}"
        current_vals = [r[f"{key}_clarity"] for r in rows_clarity if r[f"{key}_clarity"] is not None]
        prior_vals = [r[f"{key}_clarity"] for r in rows_prior if r[f"{key}_clarity"] is not None]
        current_avg = sum(current_vals) / len(current_vals) if current_vals else 0
        prior_avg = sum(prior_vals) / len(prior_vals) if prior_vals else 0
        diff = current_avg - prior_avg
        if diff > 0.5:
            trend = "up"
        elif diff < -0.5:
            trend = "down"
        else:
            trend = "flat"
        goal_clarity_trend[key] = trend

    # Weekly moods (Mon-Sun of the current week)
    today = datetime.now(tz=timezone.utc).date()
    monday = today - timedelta(days=today.weekday())
    weekly_moods = []
    for offset in range(7):
        day = monday + timedelta(days=offset)
        day_str = day.isoformat()
        row = conn.execute(
            "SELECT mood FROM thoughts WHERE status = 'replied' AND date(sent_at) = ?",
            (day_str,),
        ).fetchone()
        weekly_moods.append({
            "date": day_str,
            "mood": row["mood"] if row else None,
        })

    conn.close()

    return {
        "streak": streak,
        "streak_is_best": streak_is_best,
        "total_entries": total,
        "mood_counts_7d": mood_counts,
        "goal_clarity_avg_7d": goal_clarity_avg_7d,
        "goal_clarity_trend": goal_clarity_trend,
        "weekly_moods": weekly_moods,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd api && python3 -m pytest test_server.py::TestStats -v
```

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add api/server.py api/test_server.py
git commit -m "feat(api): add /api/stats endpoint with streak, moods, goal clarity"
```

---

## Task 3: FastAPI — `/api/entries` Endpoint

**Files:**
- Modify: `api/server.py`
- Modify: `api/test_server.py`

- [ ] **Step 1: Write tests for `/api/entries`**

Append to `api/test_server.py`:

```python
class TestEntries:
    def test_empty_db(self, client):
        resp = client.get("/api/entries")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_entries_within_days(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=(now - timedelta(days=2)).strftime("%Y-%m-%dT10:00:00+00:00"),
                prompt="recent")
        _insert(db_path, sent_at=(now - timedelta(days=30)).strftime("%Y-%m-%dT10:00:00+00:00"),
                prompt="old")
        resp = client.get("/api/entries?days=7")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["prompt"] == "recent"

    def test_default_days_is_7(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=(now - timedelta(days=5)).strftime("%Y-%m-%dT10:00:00+00:00"))
        _insert(db_path, sent_at=(now - timedelta(days=10)).strftime("%Y-%m-%dT10:00:00+00:00"))
        resp = client.get("/api/entries")
        assert len(resp.json()) == 1

    def test_entries_have_all_fields(self, client, db_path):
        from datetime import datetime, timezone
        now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT10:00:00+00:00")
        _insert(db_path, sent_at=now, mood="good", prompt="Q?", response="A!")
        data = client.get("/api/entries").json()
        entry = data[0]
        assert "id" in entry
        assert entry["prompt"] == "Q?"
        assert entry["response"] == "A!"
        assert entry["mood"] == "good"
        assert "sent_at" in entry
        assert "goal1_clarity" in entry

    def test_entries_sorted_newest_first(self, client, db_path):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        _insert(db_path, sent_at=(now - timedelta(days=3)).strftime("%Y-%m-%dT10:00:00+00:00"), prompt="older")
        _insert(db_path, sent_at=(now - timedelta(days=1)).strftime("%Y-%m-%dT10:00:00+00:00"), prompt="newer")
        data = client.get("/api/entries").json()
        assert data[0]["prompt"] == "newer"
        assert data[1]["prompt"] == "older"

    def test_excludes_timed_out(self, client, db_path):
        from datetime import datetime, timezone
        now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT10:00:00+00:00")
        _insert(db_path, sent_at=now, status="timed_out", response=None)
        data = client.get("/api/entries").json()
        assert len(data) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd api && python3 -m pytest test_server.py::TestEntries -v
```

Expected: FAIL — 404

- [ ] **Step 3: Implement `/api/entries` in `api/server.py`**

Add below the `/api/stats` endpoint:

```python
from fastapi import Query


@app.get("/api/entries")
def get_entries(days: int = Query(default=7, ge=1, le=365)):
    cutoff = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM thoughts WHERE status = 'replied' AND sent_at >= ? "
        "ORDER BY sent_at DESC",
        (cutoff,),
    ).fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "prompt": r["prompt"],
            "response": r["response"],
            "mood": r["mood"],
            "sent_at": r["sent_at"],
            "responded_at": r["responded_at"],
            "goal1_clarity": r["goal1_clarity"],
            "goal1_done_today": bool(r["goal1_done_today"]) if r["goal1_done_today"] is not None else None,
            "goal1_good": r["goal1_good"],
            "goal1_bad": r["goal1_bad"],
            "goal2_clarity": r["goal2_clarity"],
            "goal2_done_today": bool(r["goal2_done_today"]) if r["goal2_done_today"] is not None else None,
            "goal2_good": r["goal2_good"],
            "goal2_bad": r["goal2_bad"],
            "goal3_clarity": r["goal3_clarity"],
            "goal3_done_today": bool(r["goal3_done_today"]) if r["goal3_done_today"] is not None else None,
            "goal3_good": r["goal3_good"],
            "goal3_bad": r["goal3_bad"],
        }
        for r in rows
    ]
```

- [ ] **Step 4: Run all API tests**

Run:
```bash
cd api && python3 -m pytest test_server.py -v
```

Expected: All tests PASS (TestToday: 4, TestStats: 8, TestEntries: 6 = 18 total)

- [ ] **Step 5: Verify existing tests still pass**

Run:
```bash
cd /Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts && python3 -m pytest tests/ -v
```

Expected: All existing tests PASS (the API does not modify any existing code)

- [ ] **Step 6: Commit**

```bash
git add api/server.py api/test_server.py
git commit -m "feat(api): add /api/entries endpoint, complete API layer"
```

---

## Task 4: Next.js Project Scaffolding

**Files:**
- Create: `frontend/` directory with Next.js boilerplate
- Create: `frontend/next.config.ts`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx` (placeholder)
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/theme-provider.tsx`
- Create: `frontend/src/components/theme-toggle.tsx`

- [ ] **Step 1: Scaffold Next.js project**

Run:
```bash
cd /Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts && npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

When prompted, accept defaults (uses npm).

- [ ] **Step 2: Install additional dependencies**

Run:
```bash
cd frontend && npm install next-themes @tremor/react clsx tailwind-merge class-variance-authority lucide-react
```

- [ ] **Step 3: Initialize shadcn/ui**

Run:
```bash
cd frontend && npx shadcn@latest init -d
```

This generates `components.json` and `src/lib/utils.ts`. Then add the UI primitives we need:

```bash
cd frontend && npx shadcn@latest add card button badge progress
```

- [ ] **Step 4: Configure API proxy in `frontend/next.config.ts`**

This avoids CORS issues during development by proxying `/api/*` to the FastAPI server:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 5: Create `frontend/src/lib/api.ts`**

```typescript
export interface TodayResponse {
  prompt: string;
  response: string;
  mood: "good" | "bad" | "neutral";
  sent_at: string;
  responded_at: string;
  goals: {
    goal1: GoalDetail;
    goal2: GoalDetail;
    goal3: GoalDetail;
  };
}

interface GoalDetail {
  name: string;
  clarity: number | null;
  done_today: boolean | null;
  good: string | null;
  bad: string | null;
}

export interface StatsResponse {
  streak: number;
  streak_is_best: boolean;
  total_entries: number;
  mood_counts_7d: { good: number; neutral: number; bad: number };
  goal_clarity_avg_7d: Record<string, { name: string; avg: number }>;
  goal_clarity_trend: Record<string, "up" | "down" | "flat">;
  weekly_moods: Array<{ date: string; mood: "good" | "bad" | "neutral" | null }>;
}

export interface EntryResponse {
  id: number;
  prompt: string;
  response: string;
  mood: "good" | "bad" | "neutral" | null;
  sent_at: string;
  responded_at: string | null;
  goal1_clarity: number | null;
  goal1_done_today: boolean | null;
  goal1_good: string | null;
  goal1_bad: string | null;
  goal2_clarity: number | null;
  goal2_done_today: boolean | null;
  goal2_good: string | null;
  goal2_bad: string | null;
  goal3_clarity: number | null;
  goal3_done_today: boolean | null;
  goal3_good: string | null;
  goal3_bad: string | null;
}

const BASE = "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getToday(): Promise<TodayResponse | null> {
  return fetchJson<TodayResponse | null>("/api/today");
}

export async function getStats(): Promise<StatsResponse> {
  return fetchJson<StatsResponse>("/api/stats");
}

export async function getEntries(days = 7): Promise<EntryResponse[]> {
  return fetchJson<EntryResponse[]>(`/api/entries?days=${days}`);
}
```

- [ ] **Step 6: Create theme provider**

Create `frontend/src/components/theme-provider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 7: Create theme toggle**

Create `frontend/src/components/theme-toggle.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
```

- [ ] **Step 8: Update root layout**

Replace `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Daily Thoughts",
  description: "Your personal reflection dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <header className="flex items-center justify-between px-6 py-4 border-b">
            <h1 className="text-xl font-bold">Daily Thoughts</h1>
            <ThemeToggle />
          </header>
          <main className="p-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Create placeholder page**

Replace `frontend/src/app/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <p className="text-muted-foreground col-span-full text-center py-20">
        Dashboard tiles coming next...
      </p>
    </div>
  );
}
```

- [ ] **Step 10: Verify the dev server starts**

Run:
```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Next.js app with shadcn/ui, theme toggle, API client"
```

---

## Task 5: Dashboard Tile — Today's Mood (hero tile)

**Files:**
- Create: `frontend/src/components/dashboard/today-mood.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create the Today's Mood component**

Create `frontend/src/components/dashboard/today-mood.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import type { TodayResponse } from "@/lib/api";

const MOOD_CONFIG = {
  good: { emoji: "\u{1F60A}", label: "Good", gradient: "from-purple-500 to-blue-500" },
  neutral: { emoji: "\u{1F610}", label: "Neutral", gradient: "from-amber-500 to-orange-400" },
  bad: { emoji: "\u{1F614}", label: "Bad", gradient: "from-red-500 to-pink-500" },
};

export function TodayMood({ data }: { data: TodayResponse | null }) {
  if (!data) {
    return (
      <Card className="col-span-1 md:col-span-2 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-4xl mb-2">🌅</p>
          <p className="text-muted-foreground">No entry yet today</p>
        </CardContent>
      </Card>
    );
  }

  const config = MOOD_CONFIG[data.mood] ?? MOOD_CONFIG.neutral;

  return (
    <Card className={`col-span-1 md:col-span-2 bg-gradient-to-br ${config.gradient} text-white`}>
      <CardContent className="py-8 px-6">
        <div className="flex items-center gap-4">
          <span className="text-5xl">{config.emoji}</span>
          <div>
            <p className="text-2xl font-bold">{config.label}</p>
            <p className="text-white/80 text-sm mt-1 line-clamp-2">{data.response}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the dashboard page**

Replace `frontend/src/app/page.tsx`:

```tsx
import { getToday, getStats, getEntries } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  try {
    today = await getToday();
  } catch {}

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <TodayMood data={today} />
    </div>
  );
}
```

- [ ] **Step 3: Verify it renders**

Start both servers:
```bash
# Terminal 1:
cd api && DB_PATH=../data/thoughts.db uvicorn server:app --reload --port 8000

# Terminal 2:
cd frontend && npm run dev
```

Open `http://localhost:3000`. Verify the hero tile shows mood data (or "No entry yet today" if no entry exists for today).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/today-mood.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add Today's Mood hero tile"
```

---

## Task 6: Dashboard Tiles — Streak + Weekly Mood Grid

**Files:**
- Create: `frontend/src/components/dashboard/streak.tsx`
- Create: `frontend/src/components/dashboard/weekly-mood.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create the Streak component**

Create `frontend/src/components/dashboard/streak.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";

export function Streak({ streak, isBest }: { streak: number; isBest: boolean }) {
  return (
    <Card className="col-span-1">
      <CardContent className="py-8 flex flex-col items-center justify-center">
        <p className="text-5xl font-black bg-gradient-to-br from-purple-500 to-pink-500 bg-clip-text text-transparent">
          {streak}
        </p>
        <p className="text-sm text-muted-foreground mt-1">days in a row</p>
        {isBest && (
          <p className="text-xs text-purple-500 font-medium mt-2">
            ✨ Personal best!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the Weekly Mood Grid component**

Create `frontend/src/components/dashboard/weekly-mood.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const MOOD_STYLES: Record<string, string> = {
  good: "bg-purple-500 text-white",
  neutral: "bg-amber-400 text-white",
  bad: "bg-red-500 text-white",
};

const MOOD_EMOJI: Record<string, string> = {
  good: "\u{1F60A}",
  neutral: "\u{1F610}",
  bad: "\u{1F614}",
};

interface WeeklyMoodProps {
  weeklyMoods: Array<{ date: string; mood: string | null }>;
}

export function WeeklyMood({ weeklyMoods }: WeeklyMoodProps) {
  return (
    <Card className="col-span-1">
      <CardContent className="py-6 px-4">
        <p className="text-xs text-muted-foreground mb-3 font-medium">This Week</p>
        <div className="grid grid-cols-7 gap-1.5">
          {weeklyMoods.map((day, i) => (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{DAY_LABELS[i]}</span>
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center text-sm ${
                  day.mood
                    ? MOOD_STYLES[day.mood]
                    : "border-2 border-dashed border-muted-foreground/30"
                }`}
              >
                {day.mood ? MOOD_EMOJI[day.mood] : ""}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire both into the dashboard page**

Update `frontend/src/app/page.tsx`:

```tsx
import { getToday, getStats, getEntries } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  try {
    [today, stats] = await Promise.all([getToday(), getStats()]);
  } catch {}

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <TodayMood data={today} />
      <Streak streak={stats?.streak ?? 0} isBest={stats?.streak_is_best ?? false} />
      <WeeklyMood weeklyMoods={stats?.weekly_moods ?? Array.from({ length: 7 }, (_, i) => ({ date: "", mood: null }))} />
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3000`. Confirm:
- Streak number renders with gradient text
- Weekly mood grid shows 7 squares (Mon-Sun), color-coded or dashed outlines

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/streak.tsx frontend/src/components/dashboard/weekly-mood.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add Streak and Weekly Mood Grid tiles"
```

---

## Task 7: Dashboard Tile — Goal Clarity

**Files:**
- Create: `frontend/src/components/dashboard/goal-clarity.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create the Goal Clarity component**

Create `frontend/src/components/dashboard/goal-clarity.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { StatsResponse } from "@/lib/api";

const GOAL_COLORS: Record<string, string> = {
  goal1: "text-purple-500 [&>div]:bg-purple-500",
  goal2: "text-pink-500 [&>div]:bg-pink-500",
  goal3: "text-blue-500 [&>div]:bg-blue-500",
};

const TREND_ICONS = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

interface GoalClarityProps {
  clarity: StatsResponse["goal_clarity_avg_7d"];
  trend: StatsResponse["goal_clarity_trend"];
}

export function GoalClarity({ clarity, trend }: GoalClarityProps) {
  const goals = ["goal1", "goal2", "goal3"] as const;

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardContent className="py-6 space-y-4">
        <p className="text-xs text-muted-foreground font-medium">Goal Clarity (7-day avg)</p>
        {goals.map((key) => {
          const goal = clarity[key];
          const trendDir = trend[key] ?? "flat";
          const TrendIcon = TREND_ICONS[trendDir];
          if (!goal) return null;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{goal.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums">{goal.avg}/10</span>
                  <TrendIcon className={`h-3.5 w-3.5 ${
                    trendDir === "up" ? "text-green-500" : trendDir === "down" ? "text-red-500" : "text-muted-foreground"
                  }`} />
                </div>
              </div>
              <Progress value={goal.avg * 10} className={GOAL_COLORS[key]} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into the dashboard page**

Update the imports and grid in `frontend/src/app/page.tsx`:

```tsx
import { getToday, getStats, getEntries } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";
import { GoalClarity } from "@/components/dashboard/goal-clarity";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  try {
    [today, stats] = await Promise.all([getToday(), getStats()]);
  } catch {}

  const defaultClarity = {
    goal1: { name: "AI Expert", avg: 0 },
    goal2: { name: "Substack and Instagram", avg: 0 },
    goal3: { name: "Health", avg: 0 },
  };
  const defaultTrend = { goal1: "flat" as const, goal2: "flat" as const, goal3: "flat" as const };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <TodayMood data={today} />
      <Streak streak={stats?.streak ?? 0} isBest={stats?.streak_is_best ?? false} />
      <WeeklyMood weeklyMoods={stats?.weekly_moods ?? Array.from({ length: 7 }, () => ({ date: "", mood: null }))} />
      <GoalClarity
        clarity={stats?.goal_clarity_avg_7d ?? defaultClarity}
        trend={stats?.goal_clarity_trend ?? defaultTrend}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000`. Confirm:
- Three progress bars render with goal names
- Score and trend arrow visible for each

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/goal-clarity.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add Goal Clarity tile with progress bars and trends"
```

---

## Task 8: Dashboard Tile — Mood Chart (Tremor)

**Files:**
- Create: `frontend/src/components/dashboard/mood-chart.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create the Mood Chart component**

Create `frontend/src/components/dashboard/mood-chart.tsx`:

```tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BarChart } from "@tremor/react";

const MOOD_VALUE: Record<string, number> = {
  good: 3,
  neutral: 2,
  bad: 1,
};

const MOOD_COLOR: Record<string, string> = {
  good: "purple",
  neutral: "amber",
  bad: "red",
};

interface MoodChartProps {
  weeklyMoods: Array<{ date: string; mood: string | null }>;
}

export function MoodChart({ weeklyMoods }: MoodChartProps) {
  const chartData = weeklyMoods.map((day) => {
    const date = new Date(day.date + "T00:00:00");
    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
    return {
      day: dayLabel,
      Mood: day.mood ? MOOD_VALUE[day.mood] : 0,
      mood_raw: day.mood,
    };
  });

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-4">Mood This Week</p>
        <BarChart
          data={chartData}
          index="day"
          categories={["Mood"]}
          colors={["purple"]}
          yAxisWidth={30}
          showLegend={false}
          valueFormatter={(v) =>
            v === 3 ? "Good" : v === 2 ? "Neutral" : v === 1 ? "Bad" : "—"
          }
          className="h-40"
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into the dashboard page**

Update `frontend/src/app/page.tsx` — add the import and component to the grid:

```tsx
import { getToday, getStats, getEntries } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";
import { GoalClarity } from "@/components/dashboard/goal-clarity";
import { MoodChart } from "@/components/dashboard/mood-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  try {
    [today, stats] = await Promise.all([getToday(), getStats()]);
  } catch {}

  const defaultClarity = {
    goal1: { name: "AI Expert", avg: 0 },
    goal2: { name: "Substack and Instagram", avg: 0 },
    goal3: { name: "Health", avg: 0 },
  };
  const defaultTrend = { goal1: "flat" as const, goal2: "flat" as const, goal3: "flat" as const };
  const emptyWeek = Array.from({ length: 7 }, () => ({ date: "", mood: null }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <TodayMood data={today} />
      <Streak streak={stats?.streak ?? 0} isBest={stats?.streak_is_best ?? false} />
      <WeeklyMood weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
      <GoalClarity
        clarity={stats?.goal_clarity_avg_7d ?? defaultClarity}
        trend={stats?.goal_clarity_trend ?? defaultTrend}
      />
      <MoodChart weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000`. Confirm:
- Bar chart renders with days of the week on x-axis
- Bars show mood levels, hover tooltip says Good/Neutral/Bad

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/mood-chart.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add Mood Chart tile with Tremor BarChart"
```

---

## Task 9: Dashboard Tile — Recent Entries (full-width)

**Files:**
- Create: `frontend/src/components/dashboard/recent-entries.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create the Recent Entries component**

Create `frontend/src/components/dashboard/recent-entries.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { EntryResponse } from "@/lib/api";

const MOOD_EMOJI: Record<string, string> = {
  good: "\u{1F60A}",
  neutral: "\u{1F610}",
  bad: "\u{1F614}",
};

function primaryGoalTag(entry: EntryResponse): string | null {
  if (entry.goal1_done_today) return "AI Expert";
  if (entry.goal2_done_today) return "Substack";
  if (entry.goal3_done_today) return "Health";
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentEntries({ entries }: { entries: EntryResponse[] }) {
  if (entries.length === 0) {
    return (
      <Card className="col-span-full">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No entries yet. Start journaling via Telegram!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardContent className="py-4 px-0">
        <p className="text-xs text-muted-foreground font-medium px-6 mb-3">Recent Entries</p>
        <div className="max-h-80 overflow-y-auto">
          {entries.map((entry) => {
            const tag = primaryGoalTag(entry);
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <span className="text-xl flex-shrink-0">
                  {entry.mood ? MOOD_EMOJI[entry.mood] : "⬜"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{entry.response}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(entry.sent_at)}
                  </p>
                </div>
                {tag && (
                  <Badge variant="secondary" className="flex-shrink-0 text-xs">
                    {tag}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into the dashboard page — final version**

Replace `frontend/src/app/page.tsx` with the complete dashboard:

```tsx
import { getToday, getStats, getEntries } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";
import { GoalClarity } from "@/components/dashboard/goal-clarity";
import { MoodChart } from "@/components/dashboard/mood-chart";
import { RecentEntries } from "@/components/dashboard/recent-entries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  let entries: Awaited<ReturnType<typeof getEntries>> = [];

  try {
    [today, stats, entries] = await Promise.all([
      getToday(),
      getStats(),
      getEntries(7),
    ]);
  } catch {}

  const defaultClarity = {
    goal1: { name: "AI Expert", avg: 0 },
    goal2: { name: "Substack and Instagram", avg: 0 },
    goal3: { name: "Health", avg: 0 },
  };
  const defaultTrend = { goal1: "flat" as const, goal2: "flat" as const, goal3: "flat" as const };
  const emptyWeek = Array.from({ length: 7 }, () => ({ date: "", mood: null }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
      <TodayMood data={today} />
      <Streak streak={stats?.streak ?? 0} isBest={stats?.streak_is_best ?? false} />
      <WeeklyMood weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
      <GoalClarity
        clarity={stats?.goal_clarity_avg_7d ?? defaultClarity}
        trend={stats?.goal_clarity_trend ?? defaultTrend}
      />
      <MoodChart weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
      <RecentEntries entries={entries} />
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser — full dashboard**

Open `http://localhost:3000`. Verify all 6 tiles:
1. Today's Mood: gradient hero with emoji or "no entry" state
2. Streak: large number with gradient text
3. Weekly Mood: 7 emoji squares in a row
4. Goal Clarity: 3 progress bars with scores and trend arrows
5. Mood Chart: bar chart with 7 days
6. Recent Entries: scrollable list with mood, text, date, goal tag, chevron

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/recent-entries.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add Recent Entries tile, complete 6-tile dashboard"
```

---

## Task 10: Responsive Polish & Dark Mode Verification

**Files:**
- Possibly adjust: `frontend/src/app/globals.css`
- Possibly adjust: component files

- [ ] **Step 1: Test dark mode**

Open `http://localhost:3000`. Click the theme toggle (moon/sun icon). Verify:
- All tiles switch between dark and light themes
- Text is readable in both modes
- Gradient tiles (Today's Mood) look good on both backgrounds

- [ ] **Step 2: Test responsive breakpoints**

Resize browser window and verify:
- **Desktop (>1024px):** 4-column grid — tiles arranged as specified
- **Tablet (768-1024px):** 2-column grid — tiles reflow naturally
- **Mobile (<768px):** single column stack — all tiles full width

- [ ] **Step 3: Test empty state**

Stop the FastAPI server. Reload `http://localhost:3000`. Verify:
- Dashboard renders without crashing
- All tiles show graceful empty/default states

- [ ] **Step 4: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: No errors. Fix any lint issues if they appear.

- [ ] **Step 5: Run final build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Run all API tests one final time**

```bash
cd api && python3 -m pytest test_server.py -v
```

Expected: All tests PASS.

- [ ] **Step 7: Run existing Python tests**

```bash
cd /Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts && python3 -m pytest tests/ -v
```

Expected: All existing tests PASS (the new code didn't touch anything).

- [ ] **Step 8: Commit any polish fixes**

```bash
git add -A
git commit -m "chore: responsive polish and dark mode fixes"
```

(Only create this commit if there were actual changes to make.)

---

## Task 11: Update `.gitignore` and Final Cleanup

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update `.gitignore` with frontend entries**

Append to the existing `.gitignore`:

```
# Frontend
frontend/node_modules/
frontend/.next/
frontend/out/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add frontend build artifacts to .gitignore"
```

- [ ] **Step 3: Verify the full app end-to-end**

Start both servers:
```bash
# Terminal 1:
cd api && DB_PATH=../data/thoughts.db uvicorn server:app --reload --port 8000

# Terminal 2:
cd frontend && npm run dev
```

Open `http://localhost:3000` and verify the complete dashboard works with real data from `thoughts.db`.
