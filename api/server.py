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
