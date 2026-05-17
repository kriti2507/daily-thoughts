# daily-thoughts v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend daily-thoughts so each cron run uses an LLM (Claude by default, provider swappable) to generate a goal-aware question and to categorize the user's reply into structured fields stored in SQLite.

**Architecture:** Same single-process, one-shot script as v1. New flow per run: load `.env` + `goals.md` → fetch last N days of replied rows from SQLite → ask LLM for a context-aware question → send/poll on Telegram (unchanged) → if reply: ask LLM to categorize via tool-use → insert one row with prompt, response, and 13 nullable categorization columns. LLM provider is hidden behind a `LLMClient` protocol; only Anthropic is implemented for v2.

**Tech Stack:** Python 3.11+, `requests`, `python-dotenv`, `anthropic` SDK, stdlib `sqlite3`, `pytest`. Anthropic tool-use for structured categorization output.

**Spec reference:** `docs/superpowers/specs/2026-05-16-daily-thoughts-v2-design.md`

---

## File Structure

**New files:**
- `goals.md` — committed template at repo root, user edits
- `src/goals.py` — `Goal` dataclass + `load_goals(path)` parser
- `src/llm.py` — `Categorization`, `GoalCat` dataclasses + `LLMClient` Protocol + `AnthropicLLMClient` + `make_llm_client(config)` factory
- `tests/test_goals.py` — parser tests
- `tests/test_llm.py` — LLM module tests (Anthropic SDK mocked)

**Modified files:**
- `src/db.py` — extended schema + 13 new kwargs on `insert_thought` + new `fetch_recent_replied`
- `src/config.py` — 5 new env vars + Anthropic-provider key validation
- `src/main.py` — new orchestration flow
- `.env.example` — new env keys
- `requirements.txt` — add `anthropic`
- `manual.md` — short addition about goals + new env vars
- `tests/test_db.py` — new tests for added columns, schema, fetch
- `tests/test_config.py` — new tests for added env vars

**Deletions:**
- `src/prompts.py`, `tests/test_prompts.py`

---

## Task 1: Add `anthropic` dependency + new `.env.example` keys

**Files:**
- Modify: `requirements.txt`, `.env.example`

- [ ] **Step 1: Update `requirements.txt`**

Replace `requirements.txt` with:

```
requests>=2.31
python-dotenv>=1.0
anthropic>=0.40
pytest>=8.0
```

- [ ] **Step 2: Update `.env.example`**

Replace `.env.example` with:

```
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF-your-bot-token-here
TELEGRAM_CHAT_ID=987654321

# Polling
REPLY_TIMEOUT_SECONDS=3600

# Storage (relative to repo root)
DB_PATH=data/thoughts.db

# Goals
GOALS_PATH=goals.md
HISTORY_DAYS=7

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

- [ ] **Step 3: Install the new dep into the venv**

Run: `.venv/bin/pip install -r requirements.txt`
Expected: `anthropic` installs cleanly. Existing packages stay.

Verify:

```bash
.venv/bin/python -c "import anthropic; print(anthropic.__version__)"
```

Expected: prints a version ≥ 0.40.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt .env.example
git commit -m "Add anthropic SDK dependency and v2 env keys"
```

---

## Task 2: Goals module — failing tests

**Files:**
- Create: `tests/test_goals.py`

- [ ] **Step 1: Write failing tests**

Write to `tests/test_goals.py`:

```python
from pathlib import Path

import pytest

from src.goals import Goal, load_goals


def _write_goals(tmp_path: Path, contents: str) -> Path:
    path = tmp_path / "goals.md"
    path.write_text(contents)
    return path


_VALID = """# Goals

## 1. Run more
Run 3 times a week, 5km per session.

## 2. Read daily
30 minutes of reading every evening.

## 3. Meditate
10 minutes each morning.
"""


def test_load_goals_returns_three_goals_with_titles_and_descriptions(tmp_path):
    path = _write_goals(tmp_path, _VALID)

    goals = load_goals(path)

    assert len(goals) == 3
    assert goals[0] == Goal(
        index=1,
        title="Run more",
        description="Run 3 times a week, 5km per session.",
    )
    assert goals[1].index == 2
    assert goals[1].title == "Read daily"
    assert goals[1].description == "30 minutes of reading every evening."
    assert goals[2].index == 3
    assert goals[2].title == "Meditate"
    assert goals[2].description == "10 minutes each morning."


def test_load_goals_supports_multiline_descriptions(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n"
        "## 1. A\nline1\nline2\n\n"
        "## 2. B\nbody\n\n"
        "## 3. C\nbody\n",
    )

    goals = load_goals(path)

    assert goals[0].description == "line1\nline2"


def test_load_goals_raises_on_missing_file(tmp_path):
    missing = tmp_path / "nope.md"

    with pytest.raises(FileNotFoundError):
        load_goals(missing)


def test_load_goals_raises_when_fewer_than_three(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## 1. A\nbody\n\n## 2. B\nbody\n",
    )

    with pytest.raises(ValueError, match="found 2"):
        load_goals(path)


def test_load_goals_raises_when_more_than_three(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## 1. A\nx\n## 2. B\nx\n## 3. C\nx\n## 4. D\nx\n",
    )

    with pytest.raises(ValueError, match="found 4"):
        load_goals(path)


def test_load_goals_raises_when_indices_out_of_order(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## 2. A\nx\n## 1. B\nx\n## 3. C\nx\n",
    )

    with pytest.raises(ValueError, match="indices"):
        load_goals(path)


def test_load_goals_raises_when_h2_lacks_index(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## Plain heading\nx\n## 2. B\nx\n## 3. C\nx\n",
    )

    with pytest.raises(ValueError, match="found 2"):
        load_goals(path)


def test_goal_is_frozen(tmp_path):
    g = Goal(index=1, title="x", description="y")

    with pytest.raises(Exception):
        g.title = "other"  # type: ignore[misc]
```

- [ ] **Step 2: Run tests — expect ImportError**

Run: `.venv/bin/python -m pytest tests/test_goals.py -v`
Expected: ModuleNotFoundError on `src.goals`.

---

## Task 3: Goals module — implementation + goals.md template

**Files:**
- Create: `src/goals.py`, `goals.md`

- [ ] **Step 1: Implement `src/goals.py`**

Write to `src/goals.py`:

```python
"""Parse the user's goals.md into structured Goal objects.

The schema in db.py is hard-coded for exactly 3 goals with stable slot indices
1/2/3. The parser enforces that contract so a malformed goals.md can never
corrupt categorization data downstream.
"""

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Goal:
    index: int
    title: str
    description: str


_H2_RE = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$")


def load_goals(path: Path) -> list[Goal]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"goals file not found: {path}")

    lines = path.read_text().splitlines()

    h2_positions: list[tuple[int, int, str]] = []
    for line_idx, line in enumerate(lines):
        m = _H2_RE.match(line)
        if m:
            h2_positions.append((line_idx, int(m.group(1)), m.group(2).strip()))

    if len(h2_positions) != 3:
        raise ValueError(
            f"expected 3 goals (## <int>. <title> headings), found {len(h2_positions)}"
        )

    indices = [p[1] for p in h2_positions]
    if indices != [1, 2, 3]:
        raise ValueError(
            f"goal indices must be 1, 2, 3 in order, got {indices}"
        )

    goals: list[Goal] = []
    for k, (line_idx, idx, title) in enumerate(h2_positions):
        end = h2_positions[k + 1][0] if k + 1 < len(h2_positions) else len(lines)
        body = "\n".join(lines[line_idx + 1 : end]).strip()
        goals.append(Goal(index=idx, title=title, description=body))

    return goals
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_goals.py -v`
Expected: 8 passed.

- [ ] **Step 3: Create `goals.md` template at repo root**

Write to `goals.md`:

```markdown
# Goals

## 1. <Goal title>
<Describe this goal: what does success look like, what's the current target, why does it matter?>

## 2. <Goal title>
<Description>

## 3. <Goal title>
<Description>
```

This is a template — the user replaces the placeholders with real goals before running the app. The file is committed so anyone cloning has the shape.

- [ ] **Step 4: Commit**

```bash
git add src/goals.py tests/test_goals.py goals.md
git commit -m "Add goals.md parser with strict 3-goal validation"
```

---

## Task 4: Config extensions — failing tests

**Files:**
- Modify: `tests/test_config.py`

- [ ] **Step 1: Append new tests to `tests/test_config.py`**

Append to the bottom of `tests/test_config.py`:

```python
def test_load_config_includes_new_v2_fields(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
    )

    config = load_config(env_path)

    assert config.goals_path == Path("goals.md")
    assert config.history_days == 7
    assert config.llm_provider == "anthropic"
    assert config.llm_model == "claude-haiku-4-5-20251001"
    assert config.anthropic_api_key == "sk-test"


def test_load_config_history_days_must_be_int(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=lots\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
    )

    with pytest.raises(ValueError, match="HISTORY_DAYS"):
        load_config(env_path)


def test_load_config_anthropic_provider_requires_api_key(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        # ANTHROPIC_API_KEY missing
        ,
    )

    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        load_config(env_path)


def test_load_config_unknown_provider_is_accepted_at_load_time(tmp_path):
    # We accept the value at config-load time; make_llm_client raises later
    # for unknown providers. This keeps the config module agnostic to providers.
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=local\n"
        "LLM_MODEL=llama-3-8b\n"
        # No ANTHROPIC_API_KEY required when provider isn't anthropic
        ,
    )

    config = load_config(env_path)

    assert config.llm_provider == "local"
    assert config.anthropic_api_key is None
```

- [ ] **Step 2: Run tests — expect 4 failures + 6 existing passes**

Run: `.venv/bin/python -m pytest tests/test_config.py -v`
Expected: existing 6 tests pass; new 4 fail because `Config` doesn't have the new fields.

---

## Task 5: Config extensions — implementation

**Files:**
- Modify: `src/config.py`

- [ ] **Step 1: Replace `src/config.py` with extended version**

Write to `src/config.py`:

```python
"""Config loading. Single source of truth for env-driven settings."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values


_REQUIRED_KEYS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "REPLY_TIMEOUT_SECONDS",
    "DB_PATH",
    "GOALS_PATH",
    "HISTORY_DAYS",
    "LLM_PROVIDER",
    "LLM_MODEL",
)


@dataclass(frozen=True)
class Config:
    telegram_bot_token: str
    telegram_chat_id: int
    reply_timeout_seconds: int
    db_path: Path
    goals_path: Path
    history_days: int
    llm_provider: str
    llm_model: str
    anthropic_api_key: Optional[str]


def load_config(env_path: Path) -> Config:
    env_path = Path(env_path)
    if not env_path.exists():
        raise FileNotFoundError(f"env file not found: {env_path}")

    values = dotenv_values(env_path)

    missing = [k for k in _REQUIRED_KEYS if not values.get(k)]
    if missing:
        raise ValueError(f"Missing required env keys: {', '.join(missing)}")

    try:
        chat_id = int(values["TELEGRAM_CHAT_ID"])
    except ValueError as exc:
        raise ValueError(
            f"TELEGRAM_CHAT_ID must be an integer, got: {values['TELEGRAM_CHAT_ID']!r}"
        ) from exc

    try:
        timeout = int(values["REPLY_TIMEOUT_SECONDS"])
    except ValueError as exc:
        raise ValueError(
            f"REPLY_TIMEOUT_SECONDS must be an integer, got: {values['REPLY_TIMEOUT_SECONDS']!r}"
        ) from exc

    try:
        history_days = int(values["HISTORY_DAYS"])
    except ValueError as exc:
        raise ValueError(
            f"HISTORY_DAYS must be an integer, got: {values['HISTORY_DAYS']!r}"
        ) from exc

    provider = values["LLM_PROVIDER"].strip().lower()
    anthropic_key = values.get("ANTHROPIC_API_KEY") or None
    if provider == "anthropic" and not anthropic_key:
        raise ValueError(
            "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic"
        )

    return Config(
        telegram_bot_token=values["TELEGRAM_BOT_TOKEN"],
        telegram_chat_id=chat_id,
        reply_timeout_seconds=timeout,
        db_path=Path(values["DB_PATH"]),
        goals_path=Path(values["GOALS_PATH"]),
        history_days=history_days,
        llm_provider=provider,
        llm_model=values["LLM_MODEL"],
        anthropic_api_key=anthropic_key,
    )
```

- [ ] **Step 2: Run tests to verify all pass**

Run: `.venv/bin/python -m pytest tests/test_config.py -v`
Expected: 10 passed (6 original + 4 new).

- [ ] **Step 3: Commit**

```bash
git add src/config.py tests/test_config.py
git commit -m "Extend config with goals path, history window, and LLM provider settings"
```

---

## Task 6: DB schema extension — failing tests

**Files:**
- Modify: `tests/test_db.py`

- [ ] **Step 1: Replace `tests/test_db.py` with extended version**

Write to `tests/test_db.py`:

```python
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

    # Inside the 7-day window
    insert_thought(
        db_path,
        prompt="recent",
        sent_at=_iso_days_ago(2),
        telegram_message_id=1,
        response="r",
        responded_at=_iso_days_ago(2),
        status="replied",
    )
    # Outside the window
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
```

- [ ] **Step 2: Run tests — expect ImportError on `fetch_recent_replied`**

Run: `.venv/bin/python -m pytest tests/test_db.py -v`
Expected: collection error — `fetch_recent_replied` doesn't exist; new schema columns missing.

---

## Task 7: DB schema extension — implementation

**Files:**
- Modify: `src/db.py`

- [ ] **Step 1: Replace `src/db.py` with extended version**

Write to `src/db.py`:

```python
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
    """Return replied rows from the last `days` days, oldest → newest, as dicts."""
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
```

- [ ] **Step 2: Run tests to verify all pass**

Run: `.venv/bin/python -m pytest tests/test_db.py -v`
Expected: 14 passed.

- [ ] **Step 3: Commit**

```bash
git add src/db.py tests/test_db.py
git commit -m "Extend schema with categorization columns and recent-replied fetch"
```

---

## Task 8: LLM module foundations — Categorization, GoalCat, factory, generate_question

**Files:**
- Create: `src/llm.py`, `tests/test_llm.py`

- [ ] **Step 1: Write failing tests in `tests/test_llm.py`**

Write to `tests/test_llm.py`:

```python
from unittest.mock import patch, MagicMock

import pytest

from src.llm import (
    Categorization,
    GoalCat,
    AnthropicLLMClient,
    make_llm_client,
)
from src.goals import Goal


def _goals() -> list[Goal]:
    return [
        Goal(index=1, title="Run", description="Run more"),
        Goal(index=2, title="Read", description="Read daily"),
        Goal(index=3, title="Meditate", description="Daily 10 min"),
    ]


def _text_block(text: str) -> MagicMock:
    b = MagicMock()
    b.type = "text"
    b.text = text
    return b


def _tool_use_block(input_data: dict) -> MagicMock:
    b = MagicMock()
    b.type = "tool_use"
    b.name = "record_categorization"
    b.input = input_data
    return b


# ---------- Dataclasses ----------

def test_goal_cat_is_frozen():
    g = GoalCat(clarity=True, done_today=False, something_good=None, something_bad=None)
    with pytest.raises(Exception):
        g.clarity = False  # type: ignore[misc]


def test_categorization_is_frozen():
    c = Categorization(mood="good", per_goal={1: GoalCat(True, True, None, None)})
    with pytest.raises(Exception):
        c.mood = "bad"  # type: ignore[misc]


# ---------- Factory ----------

class _DummyConfig:
    llm_provider = "anthropic"
    llm_model = "claude-test"
    anthropic_api_key = "sk-test"


class _UnknownConfig:
    llm_provider = "local"
    llm_model = "llama"
    anthropic_api_key = None


def test_make_llm_client_returns_anthropic_client_for_anthropic_provider():
    client = make_llm_client(_DummyConfig())
    assert isinstance(client, AnthropicLLMClient)


def test_make_llm_client_raises_not_implemented_for_unknown_provider():
    with pytest.raises(NotImplementedError, match="local"):
        make_llm_client(_UnknownConfig())


# ---------- generate_question ----------

@patch("src.llm.anthropic.Anthropic")
def test_generate_question_returns_text_from_response(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("What did you read today?")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    result = client.generate_question(_goals(), [])

    assert result == "What did you read today?"


@patch("src.llm.anthropic.Anthropic")
def test_generate_question_passes_model_and_system_prompt(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("Q?")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    client.generate_question(_goals(), [])

    call = mock_inst.messages.create.call_args
    assert call.kwargs["model"] == "claude-test"
    assert "coaching" in call.kwargs["system"].lower() or "goal" in call.kwargs["system"].lower()
    # User message should mention each goal title at least once
    user_content = call.kwargs["messages"][0]["content"]
    assert "Run" in user_content
    assert "Read" in user_content
    assert "Meditate" in user_content


@patch("src.llm.anthropic.Anthropic")
def test_generate_question_includes_history_in_user_message(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("Q?")]
    mock_inst.messages.create.return_value = mock_response

    history = [
        {
            "sent_at": "2026-05-15T09:00:00+00:00",
            "response": "ran 5k yesterday",
            "mood": "good",
            "goal1_done_today": 1,
            "goal2_done_today": 0,
            "goal3_done_today": 1,
            "goal1_clarity": 1,
            "goal1_good": "5k done",
            "goal1_bad": None,
            "goal2_clarity": 1,
            "goal2_good": None,
            "goal2_bad": "skipped reading",
            "goal3_clarity": 1,
            "goal3_good": "ten minutes",
            "goal3_bad": None,
            "prompt": "How's it going?",
        }
    ]

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    client.generate_question(_goals(), history)

    user_content = mock_inst.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "ran 5k yesterday" in user_content


@patch("src.llm.anthropic.Anthropic")
def test_generate_question_strips_whitespace_from_result(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_text_block("  Padded question  \n")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    result = client.generate_question(_goals(), [])

    assert result == "Padded question"
```

- [ ] **Step 2: Run tests — expect ImportError on `src.llm`**

Run: `.venv/bin/python -m pytest tests/test_llm.py -v`
Expected: ImportError / ModuleNotFoundError.

- [ ] **Step 3: Implement `src/llm.py` (foundations + generate_question only — categorize comes in next task)**

Write to `src/llm.py`:

```python
"""LLM client: question generation and structured categorization.

Provider-agnostic protocol so a local-LLM backend can slot in later. Only
Anthropic is implemented in v2.
"""

from dataclasses import dataclass
from typing import Optional, Protocol

import anthropic

from src.goals import Goal


@dataclass(frozen=True)
class GoalCat:
    clarity: bool
    done_today: bool
    something_good: Optional[str]
    something_bad: Optional[str]


@dataclass(frozen=True)
class Categorization:
    mood: str  # 'good' | 'bad' | 'neutral'
    per_goal: dict[int, GoalCat]  # keys: 1, 2, 3


_SYSTEM_QUESTION = (
    "You are a coaching assistant. The user is tracking three personal goals "
    "and you receive their last week of replies (with timestamps and per-goal "
    "categorization). Ask ONE focused question that (a) helps them reflect on "
    "a goal that needs attention based on recent trends and (b) is likely to "
    "elicit answers that fill the categorization fields (mood, per-goal "
    "clarity/done/something good/something bad). Keep it under 2 sentences. "
    "Output only the question text — no preamble, no quotes."
)

_SYSTEM_CATEGORIZE = (
    "Read the user's reply and produce a structured categorization by calling "
    "the record_categorization tool. Be conservative: if a field is unclear "
    "from the reply, prefer the safer default (clarity=false, done_today=false, "
    "something_good=null, something_bad=null, mood='neutral'). Use the goals "
    "and recent history only as context."
)


def _format_goals(goals: list[Goal]) -> str:
    return "\n".join(
        f"Goal {g.index} — {g.title}: {g.description}" for g in goals
    )


def _format_history(history: list[dict]) -> str:
    if not history:
        return "(no replies in the recent window)"
    lines: list[str] = []
    for row in history:
        lines.append(
            f"- {row.get('sent_at')} mood={row.get('mood')} "
            f"done=[{row.get('goal1_done_today')},{row.get('goal2_done_today')},{row.get('goal3_done_today')}] "
            f"reply={row.get('response')!r}"
        )
    return "\n".join(lines)


def _format_question_user(goals: list[Goal], history: list[dict]) -> str:
    return (
        "Goals:\n"
        f"{_format_goals(goals)}\n\n"
        "Recent replies (oldest first):\n"
        f"{_format_history(history)}\n\n"
        "Ask the next question."
    )


class LLMClient(Protocol):
    def generate_question(
        self, goals: list[Goal], history: list[dict]
    ) -> str: ...

    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization: ...


class AnthropicLLMClient:
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def _client(self) -> anthropic.Anthropic:
        return anthropic.Anthropic(api_key=self._api_key)

    def generate_question(
        self, goals: list[Goal], history: list[dict]
    ) -> str:
        resp = self._client().messages.create(
            model=self._model,
            max_tokens=300,
            system=_SYSTEM_QUESTION,
            messages=[
                {"role": "user", "content": _format_question_user(goals, history)}
            ],
        )
        text = "".join(
            getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text"
        )
        return text.strip()

    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization:
        raise NotImplementedError("categorize is implemented in the next task")


def make_llm_client(config) -> LLMClient:
    if config.llm_provider == "anthropic":
        return AnthropicLLMClient(
            api_key=config.anthropic_api_key, model=config.llm_model
        )
    raise NotImplementedError(f"unknown LLM provider: {config.llm_provider}")
```

- [ ] **Step 4: Run tests — expect 7 passed (the categorize tests aren't here yet)**

Run: `.venv/bin/python -m pytest tests/test_llm.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/llm.py tests/test_llm.py
git commit -m "Add LLM module foundations and Anthropic generate_question"
```

---

## Task 9: LLM categorize — failing tests then implementation

**Files:**
- Modify: `tests/test_llm.py`, `src/llm.py`

- [ ] **Step 1: Append failing tests to `tests/test_llm.py`**

Append to `tests/test_llm.py`:

```python
# ---------- categorize ----------

_FULL_INPUT = {
    "mood": "good",
    "goal1_clarity": True,
    "goal1_done_today": True,
    "goal1_good": "ran 5k",
    "goal1_bad": None,
    "goal2_clarity": True,
    "goal2_done_today": False,
    "goal2_good": None,
    "goal2_bad": "skipped",
    "goal3_clarity": False,
    "goal3_done_today": True,
    "goal3_good": "felt calm",
    "goal3_bad": None,
}


@patch("src.llm.anthropic.Anthropic")
def test_categorize_parses_tool_use_into_categorization(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_tool_use_block(_FULL_INPUT)]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    cat = client.categorize("ran 5k, skipped reading, meditated", _goals(), [])

    assert isinstance(cat, Categorization)
    assert cat.mood == "good"
    assert cat.per_goal[1] == GoalCat(True, True, "ran 5k", None)
    assert cat.per_goal[2] == GoalCat(True, False, None, "skipped")
    assert cat.per_goal[3] == GoalCat(False, True, "felt calm", None)


@patch("src.llm.anthropic.Anthropic")
def test_categorize_request_uses_tool_choice_force(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_tool_use_block(_FULL_INPUT)]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    client.categorize("reply", _goals(), [])

    kwargs = mock_inst.messages.create.call_args.kwargs
    assert kwargs["model"] == "claude-test"
    assert kwargs["tool_choice"] == {
        "type": "tool",
        "name": "record_categorization",
    }
    assert len(kwargs["tools"]) == 1
    tool = kwargs["tools"][0]
    assert tool["name"] == "record_categorization"
    schema = tool["input_schema"]
    assert schema["type"] == "object"
    # All 13 categorization fields are required
    required = set(schema["required"])
    assert "mood" in required
    for i in (1, 2, 3):
        for suffix in ("clarity", "done_today", "good", "bad"):
            assert f"goal{i}_{suffix}" in required
    # Mood enum is exactly the 3 values
    assert set(schema["properties"]["mood"]["enum"]) == {"good", "bad", "neutral"}


@patch("src.llm.anthropic.Anthropic")
def test_categorize_user_message_includes_reply_and_goals(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    mock_response.content = [_tool_use_block(_FULL_INPUT)]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")
    client.categorize("i ran 5k today", _goals(), [])

    user_content = mock_inst.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "i ran 5k today" in user_content
    assert "Run" in user_content
    assert "Read" in user_content
    assert "Meditate" in user_content


@patch("src.llm.anthropic.Anthropic")
def test_categorize_raises_if_model_does_not_call_tool(MockAnthropic):
    mock_inst = MagicMock()
    MockAnthropic.return_value = mock_inst
    mock_response = MagicMock()
    # No tool_use block — only text. Forced tool_choice should prevent this,
    # but we defend against it.
    mock_response.content = [_text_block("oops, no tool call")]
    mock_inst.messages.create.return_value = mock_response

    client = AnthropicLLMClient(api_key="sk-test", model="claude-test")

    with pytest.raises(RuntimeError, match="did not call"):
        client.categorize("reply", _goals(), [])
```

- [ ] **Step 2: Run tests — expect 4 new failures, 7 existing pass**

Run: `.venv/bin/python -m pytest tests/test_llm.py -v`
Expected: 4 failures (NotImplementedError from the stub) + 7 passes.

- [ ] **Step 3: Replace the `categorize` stub in `src/llm.py` with real implementation**

Find this method in `src/llm.py`:

```python
    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization:
        raise NotImplementedError("categorize is implemented in the next task")
```

Replace it with the following. Also add the helpers and the tool-schema constant.

Add at the top of `src/llm.py` (alongside other constants):

```python
_CATEGORIZATION_TOOL = {
    "name": "record_categorization",
    "description": (
        "Record a structured categorization of the user's reply across the "
        "three goals plus an overall mood. Use null for optional text fields "
        "when the reply doesn't mention something."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "mood": {
                "type": "string",
                "enum": ["good", "bad", "neutral"],
                "description": "Overall mood of the reply.",
            },
            "goal1_clarity": {"type": "boolean"},
            "goal1_done_today": {"type": "boolean"},
            "goal1_good": {"type": ["string", "null"]},
            "goal1_bad": {"type": ["string", "null"]},
            "goal2_clarity": {"type": "boolean"},
            "goal2_done_today": {"type": "boolean"},
            "goal2_good": {"type": ["string", "null"]},
            "goal2_bad": {"type": ["string", "null"]},
            "goal3_clarity": {"type": "boolean"},
            "goal3_done_today": {"type": "boolean"},
            "goal3_good": {"type": ["string", "null"]},
            "goal3_bad": {"type": ["string", "null"]},
        },
        "required": [
            "mood",
            "goal1_clarity", "goal1_done_today", "goal1_good", "goal1_bad",
            "goal2_clarity", "goal2_done_today", "goal2_good", "goal2_bad",
            "goal3_clarity", "goal3_done_today", "goal3_good", "goal3_bad",
        ],
    },
}
```

Add this helper (e.g. above `class LLMClient`):

```python
def _format_categorize_user(
    response: str, goals: list[Goal], history: list[dict]
) -> str:
    return (
        "Goals:\n"
        f"{_format_goals(goals)}\n\n"
        "Recent replies (oldest first):\n"
        f"{_format_history(history)}\n\n"
        "User's latest reply:\n"
        f"{response}\n\n"
        "Call record_categorization with your assessment."
    )
```

Replace the `categorize` method body:

```python
    def categorize(
        self, response: str, goals: list[Goal], history: list[dict]
    ) -> Categorization:
        resp = self._client().messages.create(
            model=self._model,
            max_tokens=1024,
            system=_SYSTEM_CATEGORIZE,
            tools=[_CATEGORIZATION_TOOL],
            tool_choice={"type": "tool", "name": "record_categorization"},
            messages=[
                {
                    "role": "user",
                    "content": _format_categorize_user(response, goals, history),
                }
            ],
        )
        tool_use = next(
            (b for b in resp.content if getattr(b, "type", None) == "tool_use"),
            None,
        )
        if tool_use is None:
            raise RuntimeError(
                "model did not call record_categorization tool"
            )
        data = tool_use.input
        per_goal = {
            i: GoalCat(
                clarity=bool(data[f"goal{i}_clarity"]),
                done_today=bool(data[f"goal{i}_done_today"]),
                something_good=data.get(f"goal{i}_good"),
                something_bad=data.get(f"goal{i}_bad"),
            )
            for i in (1, 2, 3)
        }
        return Categorization(mood=data["mood"], per_goal=per_goal)
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `.venv/bin/python -m pytest tests/test_llm.py -v`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/llm.py tests/test_llm.py
git commit -m "Add LLM categorize via Anthropic tool-use with forced tool_choice"
```

---

## Task 10: Main rewiring + delete prompts module + manual.md addition

**Files:**
- Modify: `src/main.py`, `manual.md`
- Delete: `src/prompts.py`, `tests/test_prompts.py`

- [ ] **Step 1: Replace `src/main.py` with the new flow**

Write to `src/main.py`:

```python
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
```

- [ ] **Step 2: Delete `src/prompts.py` and `tests/test_prompts.py`**

```bash
git rm src/prompts.py tests/test_prompts.py
```

- [ ] **Step 3: Smoke-test the wiring with missing `.env`**

```bash
mv .env .env.bak 2>/dev/null; \
.venv/bin/python -m src.main; \
echo "exit=$?"; \
[ -f .env.bak ] && mv .env.bak .env
```

Expected: stderr `config error: env file not found: .../.env`, exit=1.

- [ ] **Step 4: Append to `manual.md`**

Open `manual.md` and append the following section at the end:

```markdown

## 5. Editing `goals.md` and LLM settings

### `goals.md`

The bot's questions and categorization are driven by `goals.md` at the repo root. Exactly 3 H2 headings, in order:

```markdown
# Goals

## 1. <Goal title>
<Description>

## 2. <Goal title>
<Description>

## 3. <Goal title>
<Description>
```

If you remove a heading or change the indices, the next run will exit 1 with a clear error before posting anything to Telegram.

You can edit the title or description any time — the goal *slot* (1/2/3) is what historic rows are tied to, not the title.

### LLM env vars

| Variable          | Default                          | Notes                                       |
| ----------------- | -------------------------------- | ------------------------------------------- |
| `LLM_PROVIDER`    | `anthropic`                      | Only `anthropic` is implemented in v2.      |
| `LLM_MODEL`       | `claude-haiku-4-5-20251001`      | Any Claude model id works.                  |
| `ANTHROPIC_API_KEY` | —                              | Required when provider is `anthropic`.       |
| `GOALS_PATH`      | `goals.md`                       | Relative paths resolve from the repo root.  |
| `HISTORY_DAYS`    | `7`                              | How many days of replied rows to pass to the LLM. |

If the LLM fails (network, bad key, etc.), the failure mode depends on where it happens:

- Failure during **question generation**: the run is skipped — nothing posted to Telegram, no row written. Cron just tries again next time.
- Failure during **categorization** (after you've already replied): the row is still written with your reply intact, but the categorization columns stay NULL. Averaging over 7 days smooths these gaps out.
```

- [ ] **Step 5: Commit**

```bash
git add src/main.py manual.md
git commit -m "Wire v2 flow with LLM-driven question and categorization"
```

(Note: `git rm` already staged the deletions; they go in this same commit.)

---

## Task 11: Full test sweep

- [ ] **Step 1: Run the full suite**

Run: `.venv/bin/python -m pytest -v`
Expected: all tests pass. Total: 8 (goals) + 10 (config) + 14 (db) + 11 (llm) + 8 (telegram) = **51 passed**.

- [ ] **Step 2: If anything fails, fix and re-run**

Address any issues. Once green, the implementation is complete.

- [ ] **Step 3 (optional, manual): End-to-end smoke test**

This requires a real Anthropic API key, a Telegram bot, and goals.md filled in with real values.

1. Edit `goals.md` and replace the placeholders with real goals.
2. Fill in `ANTHROPIC_API_KEY` in `.env`.
3. Run:
   ```bash
   cd /Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts
   .venv/bin/python -m src.main
   ```
4. Bot posts a Claude-generated question referencing one or more of your goals.
5. Reply via Telegram's reply feature.
6. Script exits 0.
7. Inspect the new row:
   ```bash
   sqlite3 data/thoughts.db "SELECT id, status, mood, goal1_done_today, goal2_done_today, goal3_done_today, substr(response,1,60) FROM thoughts ORDER BY id DESC LIMIT 1;"
   ```
   Expect: `status='replied'`, `mood` in (`good`,`bad`,`neutral`), `goalN_done_today` populated (0 or 1), response present.

8. Negative test for goals validation:
   - Comment out the `## 2.` heading in `goals.md`. Run. Expect exit 1 with "found 2".
   - Restore the heading.

9. Negative test for LLM failure:
   - Set `ANTHROPIC_API_KEY=bad` in `.env`. Run. Expect a `generate_question failed:` line on stderr and exit 0 — no Telegram message, no db row.
   - Restore the real key.
