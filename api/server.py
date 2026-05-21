import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Query
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

    total = conn.execute(
        "SELECT COUNT(*) FROM thoughts WHERE status = 'replied'"
    ).fetchone()[0]

    cutoff_7d = (datetime.now(tz=timezone.utc) - timedelta(days=7)).isoformat()
    rows_7d = conn.execute(
        "SELECT mood FROM thoughts WHERE status = 'replied' AND sent_at >= ?",
        (cutoff_7d,),
    ).fetchall()
    mood_counts = {"good": 0, "neutral": 0, "bad": 0}
    for r in rows_7d:
        if r["mood"] in mood_counts:
            mood_counts[r["mood"]] += 1

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
