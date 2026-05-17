# daily-thoughts v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python cron-triggered script that posts a generated prompt to a Telegram chat, long-polls for the user's reply, and stores the prompt/reply pair in SQLite.

**Architecture:** Single-process, one-shot script. Cron triggers `python -m src.main`. Each run: load `.env` → generate prompt → `sendMessage` → long-poll `getUpdates` until reply arrives or timeout → insert one row into SQLite → exit. Modules are isolated: `config`, `prompts`, `telegram`, `db`, `main`. The only place modules meet is `main.py`.

**Tech Stack:** Python 3.11+, `requests`, `python-dotenv`, stdlib `sqlite3`, `pytest` (dev). SQLite for storage.

**Spec reference:** `docs/superpowers/specs/2026-05-16-daily-thoughts-design.md`

---

## File Structure

**Create:**
- `.gitignore` — ignore `.env`, `data/`, Python caches, venv
- `.env.example` — template of required env vars
- `requirements.txt` — `requests`, `python-dotenv`, `pytest`
- `src/__init__.py` — empty
- `src/config.py` — `Config` dataclass + `load_config()`
- `src/prompts.py` — `generate_prompt() -> str`
- `src/telegram.py` — `send_message()`, `poll_for_reply()`, plus a small `Reply` dataclass
- `src/db.py` — `init()`, `insert_thought()`
- `src/main.py` — `main()` that orchestrates one run
- `tests/__init__.py` — empty
- `tests/test_config.py`
- `tests/test_prompts.py`
- `tests/test_db.py`
- `tests/test_telegram.py`

**Modify:**
- `README.md` — replace stub with v1 usage + crontab example

**Created at runtime (not committed):**
- `.env` — real secrets
- `data/thoughts.db` — SQLite file

---

## Task 1: Project scaffolding

**Files:**
- Create: `.gitignore`, `.env.example`, `requirements.txt`, `src/__init__.py`, `tests/__init__.py`

- [ ] **Step 1: Create `.gitignore`**

Write to `.gitignore`:

```
# Python
__pycache__/
*.py[cod]
*.egg-info/
.pytest_cache/
.venv/
venv/

# Project
.env
data/
```

- [ ] **Step 2: Create `.env.example`**

Write to `.env.example`:

```
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF-your-bot-token-here
TELEGRAM_CHAT_ID=987654321

# Polling
REPLY_TIMEOUT_SECONDS=3600

# Storage (relative to repo root)
DB_PATH=data/thoughts.db
```

- [ ] **Step 3: Create `requirements.txt`**

Write to `requirements.txt`:

```
requests>=2.31
python-dotenv>=1.0
pytest>=8.0
```

- [ ] **Step 4: Create empty package init files**

Write empty file `src/__init__.py` (zero bytes).
Write empty file `tests/__init__.py` (zero bytes).

- [ ] **Step 5: Verify pytest discovers an empty test suite**

Run: `python -m pytest`
Expected: exits cleanly with "no tests ran" (exit code 5 from pytest is fine; the key is no errors).

If pytest is not installed yet, create and activate a venv first:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example requirements.txt src/__init__.py tests/__init__.py
git commit -m "Scaffold project structure and dependencies"
```

---

## Task 2: Config module — failing test

**Files:**
- Create: `tests/test_config.py`

- [ ] **Step 1: Write failing tests for `load_config`**

Write to `tests/test_config.py`:

```python
from pathlib import Path
import pytest

from src.config import Config, load_config


def _write_env(tmp_path: Path, contents: str) -> Path:
    env_path = tmp_path / ".env"
    env_path.write_text(contents)
    return env_path


def test_load_config_returns_config_with_all_fields(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc123\n"
        "TELEGRAM_CHAT_ID=42\n"
        "REPLY_TIMEOUT_SECONDS=120\n"
        "DB_PATH=data/thoughts.db\n",
    )

    config = load_config(env_path)

    assert isinstance(config, Config)
    assert config.telegram_bot_token == "abc123"
    assert config.telegram_chat_id == 42
    assert config.reply_timeout_seconds == 120
    assert config.db_path == Path("data/thoughts.db")


def test_load_config_supports_negative_chat_id(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=-1001234567890\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n",
    )

    config = load_config(env_path)

    assert config.telegram_chat_id == -1001234567890


def test_load_config_raises_on_missing_key(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        # REPLY_TIMEOUT_SECONDS missing
        "DB_PATH=data/x.db\n",
    )

    with pytest.raises(ValueError, match="REPLY_TIMEOUT_SECONDS"):
        load_config(env_path)


def test_load_config_raises_on_unparseable_int(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=not-a-number\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n",
    )

    with pytest.raises(ValueError, match="TELEGRAM_CHAT_ID"):
        load_config(env_path)


def test_load_config_raises_on_missing_file(tmp_path):
    missing = tmp_path / "nope.env"

    with pytest.raises(FileNotFoundError):
        load_config(missing)


def test_config_is_frozen(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n",
    )
    config = load_config(env_path)

    with pytest.raises(Exception):
        config.telegram_bot_token = "other"  # type: ignore[misc]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_config.py -v`
Expected: ImportError or ModuleNotFoundError on `src.config` — module doesn't exist yet.

---

## Task 3: Config module — implementation

**Files:**
- Create: `src/config.py`

- [ ] **Step 1: Implement `Config` and `load_config`**

Write to `src/config.py`:

```python
"""Config loading. Single source of truth for env-driven settings."""

from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values


_REQUIRED_KEYS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "REPLY_TIMEOUT_SECONDS",
    "DB_PATH",
)


@dataclass(frozen=True)
class Config:
    telegram_bot_token: str
    telegram_chat_id: int
    reply_timeout_seconds: int
    db_path: Path


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

    return Config(
        telegram_bot_token=values["TELEGRAM_BOT_TOKEN"],
        telegram_chat_id=chat_id,
        reply_timeout_seconds=timeout,
        db_path=Path(values["DB_PATH"]),
    )
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `python -m pytest tests/test_config.py -v`
Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
git add src/config.py tests/test_config.py
git commit -m "Add config loader with strict validation"
```

---

## Task 4: Prompts module — failing test

**Files:**
- Create: `tests/test_prompts.py`

- [ ] **Step 1: Write failing test**

Write to `tests/test_prompts.py`:

```python
from src.prompts import generate_prompt


def test_generate_prompt_returns_non_empty_string():
    result = generate_prompt()
    assert isinstance(result, str)
    assert result.strip() != ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_prompts.py -v`
Expected: ImportError on `src.prompts`.

---

## Task 5: Prompts module — implementation

**Files:**
- Create: `src/prompts.py`

- [ ] **Step 1: Implement `generate_prompt`**

Write to `src/prompts.py`:

```python
"""Prompt generation. v1: single hard-coded string. Replace internals later."""


def generate_prompt() -> str:
    return "What's on your mind today?"
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest tests/test_prompts.py -v`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add src/prompts.py tests/test_prompts.py
git commit -m "Add generate_prompt stub returning a fixed string"
```

---

## Task 6: DB module — failing tests

**Files:**
- Create: `tests/test_db.py`

- [ ] **Step 1: Write failing tests for init + insert_thought**

Write to `tests/test_db.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_db.py -v`
Expected: ImportError on `src.db`.

---

## Task 7: DB module — implementation

**Files:**
- Create: `src/db.py`

- [ ] **Step 1: Implement schema init and insert_thought**

Write to `src/db.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `python -m pytest tests/test_db.py -v`
Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
git add src/db.py tests/test_db.py
git commit -m "Add SQLite schema init and insert_thought"
```

---

## Task 8: Telegram module — `send_message` failing tests

**Files:**
- Create: `tests/test_telegram.py`

- [ ] **Step 1: Write failing tests for send_message**

Write to `tests/test_telegram.py`:

```python
from unittest.mock import patch, MagicMock

import pytest

from src.telegram import send_message


def _mock_response(payload: dict, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload
    resp.raise_for_status = MagicMock()
    return resp


def test_send_message_posts_to_correct_url_and_returns_message_id():
    fake = _mock_response({"ok": True, "result": {"message_id": 1234}})

    with patch("src.telegram.requests.post", return_value=fake) as mock_post:
        msg_id = send_message(
            bot_token="TOKEN",
            chat_id=42,
            text="hello",
        )

    assert msg_id == 1234
    mock_post.assert_called_once()
    url = mock_post.call_args.args[0]
    assert url == "https://api.telegram.org/botTOKEN/sendMessage"
    json_payload = mock_post.call_args.kwargs["json"]
    assert json_payload == {"chat_id": 42, "text": "hello"}


def test_send_message_raises_on_http_error():
    fake = _mock_response({"ok": False, "description": "bad token"}, status_code=401)
    fake.raise_for_status.side_effect = Exception("401 Unauthorized")

    with patch("src.telegram.requests.post", return_value=fake):
        with pytest.raises(Exception, match="401 Unauthorized"):
            send_message(bot_token="BAD", chat_id=1, text="x")


def test_send_message_raises_on_api_not_ok():
    fake = _mock_response({"ok": False, "description": "chat not found"})

    with patch("src.telegram.requests.post", return_value=fake):
        with pytest.raises(RuntimeError, match="chat not found"):
            send_message(bot_token="TOKEN", chat_id=1, text="x")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_telegram.py -v`
Expected: ImportError on `src.telegram`.

---

## Task 9: Telegram module — `send_message` implementation

**Files:**
- Create: `src/telegram.py`

- [ ] **Step 1: Implement `send_message` and a `Reply` placeholder**

Write to `src/telegram.py`:

```python
"""Thin wrapper around the Telegram Bot API endpoints we use."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
import time

import requests


_API_BASE = "https://api.telegram.org"


@dataclass(frozen=True)
class Reply:
    text: str
    received_at: str  # ISO-8601 UTC


def _api_url(bot_token: str, method: str) -> str:
    return f"{_API_BASE}/bot{bot_token}/{method}"


def send_message(*, bot_token: str, chat_id: int, text: str) -> int:
    """Post a message to chat_id. Returns the bot's outgoing message_id."""
    resp = requests.post(
        _api_url(bot_token, "sendMessage"),
        json={"chat_id": chat_id, "text": text},
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(
            f"Telegram sendMessage failed: {body.get('description', 'unknown error')}"
        )
    return int(body["result"]["message_id"])
```

- [ ] **Step 2: Run send_message tests to verify they pass**

Run: `python -m pytest tests/test_telegram.py -v`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add src/telegram.py tests/test_telegram.py
git commit -m "Add telegram.send_message wrapper"
```

---

## Task 10: Telegram module — `poll_for_reply` failing tests

**Files:**
- Modify: `tests/test_telegram.py`

- [ ] **Step 1: Add failing tests for poll_for_reply**

Append to `tests/test_telegram.py`:

```python
from src.telegram import poll_for_reply, Reply


def _updates_response(updates: list) -> MagicMock:
    return _mock_response({"ok": True, "result": updates})


def _make_update(update_id: int, text: str, reply_to_message_id: int | None,
                 date: int = 1_715_000_000, chat_id: int = 42):
    msg = {
        "message_id": update_id + 1000,
        "date": date,
        "chat": {"id": chat_id, "type": "private"},
        "text": text,
    }
    if reply_to_message_id is not None:
        msg["reply_to_message"] = {"message_id": reply_to_message_id}
    return {"update_id": update_id, "message": msg}


def test_poll_for_reply_drains_then_returns_matching_reply():
    # First call: drain — returns one pending update (ignored).
    # Second call: empty.
    # Third call: a non-matching message (ignored).
    # Fourth call: the matching reply.
    drain = _updates_response([_make_update(100, "old chatter", None)])
    empty = _updates_response([])
    non_match = _updates_response([_make_update(101, "random", None)])
    match = _updates_response([_make_update(102, "my reply", reply_to_message_id=555)])

    with patch("src.telegram.requests.get",
               side_effect=[drain, empty, non_match, match]) as mock_get:
        reply = poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=555,
            timeout_seconds=60,
        )

    assert isinstance(reply, Reply)
    assert reply.text == "my reply"
    # received_at is ISO-8601 UTC string
    assert reply.received_at.endswith("+00:00") or reply.received_at.endswith("Z")
    # First call should be the drain with offset=-1
    drain_url = mock_get.call_args_list[0].args[0]
    drain_params = mock_get.call_args_list[0].kwargs["params"]
    assert drain_url == "https://api.telegram.org/botTOKEN/getUpdates"
    assert drain_params["offset"] == -1


def test_poll_for_reply_returns_none_on_timeout(monkeypatch):
    # Force the loop's time check to advance past timeout after the drain.
    times = iter([1000.0, 1000.0, 9999.0, 9999.0])
    monkeypatch.setattr("src.telegram.time.monotonic", lambda: next(times))

    drain = _updates_response([])
    empty = _updates_response([])

    with patch("src.telegram.requests.get", side_effect=[drain, empty]):
        reply = poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=555,
            timeout_seconds=60,
        )

    assert reply is None


def test_poll_for_reply_ignores_non_reply_messages():
    drain = _updates_response([])
    # An update that has no reply_to_message at all — must be ignored.
    chatter = _updates_response([_make_update(200, "hi", None)])
    match = _updates_response([_make_update(201, "actual reply", reply_to_message_id=777)])

    with patch("src.telegram.requests.get", side_effect=[drain, chatter, match]):
        reply = poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=777,
            timeout_seconds=60,
        )

    assert reply is not None
    assert reply.text == "actual reply"


def test_poll_for_reply_advances_offset_between_calls():
    drain = _updates_response([])
    batch_a = _updates_response([
        _make_update(300, "x", None),
        _make_update(301, "y", None),
    ])
    batch_b = _updates_response([
        _make_update(302, "match", reply_to_message_id=99),
    ])

    with patch("src.telegram.requests.get",
               side_effect=[drain, batch_a, batch_b]) as mock_get:
        poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=99,
            timeout_seconds=60,
        )

    # Call 2's offset should be > drain (drain offset was -1, no updates seen yet,
    # so call 2 offset is 0 or unspecified). After batch_a (update_ids 300, 301),
    # call 3 should use offset = 302.
    third_call_params = mock_get.call_args_list[2].kwargs["params"]
    assert third_call_params["offset"] == 302


def test_poll_for_reply_retries_transient_network_error(monkeypatch):
    # Simulate one network failure, then success.
    drain = _updates_response([])
    match = _updates_response([_make_update(400, "ok", reply_to_message_id=1)])

    call_log = []

    def fake_get(url, params=None, timeout=None):
        call_log.append(params)
        if len(call_log) == 2:
            raise requests.ConnectionError("transient")
        if len(call_log) == 1:
            return drain
        return match

    # Patch sleep so retry backoff doesn't slow the test.
    monkeypatch.setattr("src.telegram.time.sleep", lambda _s: None)
    monkeypatch.setattr("src.telegram.requests.get", fake_get)

    reply = poll_for_reply(
        bot_token="TOKEN",
        reply_to_message_id=1,
        timeout_seconds=60,
    )
    assert reply is not None
    assert reply.text == "ok"
```

Also add this import at the top of the file alongside the existing imports (if not already present):

```python
import requests
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `python -m pytest tests/test_telegram.py -v`
Expected: existing 3 pass; new 5 fail with ImportError on `poll_for_reply` (not yet defined).

---

## Task 11: Telegram module — `poll_for_reply` implementation

**Files:**
- Modify: `src/telegram.py`

- [ ] **Step 1: Add `poll_for_reply` and helpers**

Append to `src/telegram.py`:

```python
def _to_iso_utc(unix_ts: int) -> str:
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()


def _get_updates(bot_token: str, *, offset: int, long_poll_seconds: int) -> list:
    """One getUpdates call. Returns the raw `result` list."""
    resp = requests.get(
        _api_url(bot_token, "getUpdates"),
        params={"offset": offset, "timeout": long_poll_seconds},
        timeout=long_poll_seconds + 10,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(
            f"Telegram getUpdates failed: {body.get('description', 'unknown error')}"
        )
    return body["result"]


def _drain_offset(bot_token: str) -> int:
    """Return an offset past all currently-pending updates."""
    # offset=-1 returns at most the latest pending update without consuming earlier ones.
    # Using its update_id + 1 as the next offset effectively skips all current pending.
    result = _get_updates(bot_token, offset=-1, long_poll_seconds=0)
    if not result:
        return 0
    return int(result[-1]["update_id"]) + 1


_LONG_POLL_SECONDS = 50
_MAX_TRANSIENT_RETRIES = 3
_RETRY_BACKOFF_SECONDS = 2


def poll_for_reply(
    *,
    bot_token: str,
    reply_to_message_id: int,
    timeout_seconds: int,
) -> Optional[Reply]:
    """
    Long-poll Telegram for a message whose reply_to_message.message_id matches.
    Returns None on timeout. Drains pre-existing updates before polling.
    """
    deadline_start = time.monotonic()
    offset = _drain_offset(bot_token)

    transient_failures = 0

    while True:
        elapsed = time.monotonic() - deadline_start
        remaining = timeout_seconds - elapsed
        if remaining <= 0:
            return None

        per_call = min(_LONG_POLL_SECONDS, max(1, int(remaining)))

        try:
            updates = _get_updates(
                bot_token, offset=offset, long_poll_seconds=per_call
            )
            transient_failures = 0
        except requests.RequestException:
            transient_failures += 1
            if transient_failures > _MAX_TRANSIENT_RETRIES:
                raise
            time.sleep(_RETRY_BACKOFF_SECONDS)
            continue

        for update in updates:
            offset = max(offset, int(update["update_id"]) + 1)
            message = update.get("message")
            if not message:
                continue
            replied_to = message.get("reply_to_message")
            if not replied_to:
                continue
            if int(replied_to.get("message_id", -1)) != reply_to_message_id:
                continue
            return Reply(
                text=message.get("text", ""),
                received_at=_to_iso_utc(int(message["date"])),
            )
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `python -m pytest tests/test_telegram.py -v`
Expected: 8 passed.

- [ ] **Step 3: Commit**

```bash
git add src/telegram.py tests/test_telegram.py
git commit -m "Add telegram.poll_for_reply with drain, retry, and timeout"
```

---

## Task 12: Main entry point

**Files:**
- Create: `src/main.py`

- [ ] **Step 1: Implement orchestration**

Write to `src/main.py`:

```python
"""Entry point. One run: load config -> generate -> send -> poll -> insert."""

import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

from src import db, telegram
from src.config import load_config
from src.prompts import generate_prompt


def _now_iso_utc() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    env_path = repo_root / ".env"

    try:
        config = load_config(env_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 1

    db_path = config.db_path
    if not db_path.is_absolute():
        db_path = repo_root / db_path

    try:
        db.init(db_path)
    except Exception as exc:
        print(f"db init failed: {exc}", file=sys.stderr)
        return 1

    prompt = generate_prompt()
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
    except Exception as exc:
        # Persistent polling failure — record as timed_out so the prompt isn't lost.
        traceback.print_exc(file=sys.stderr)
        reply = None

    if reply is not None:
        db.insert_thought(
            db_path,
            prompt=prompt,
            sent_at=sent_at,
            telegram_message_id=msg_id,
            response=reply.text,
            responded_at=reply.received_at,
            status="replied",
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

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 2: Smoke-test the wiring with a stub run**

This step verifies main fails cleanly when `.env` is missing — no real network call.

Run:

```bash
mv .env .env.bak 2>/dev/null; \
python -m src.main; \
echo "exit=$?"; \
[ -f .env.bak ] && mv .env.bak .env
```

Expected: stderr shows `config error: env file not found: .../.env`; `exit=1`.

- [ ] **Step 3: Commit**

```bash
git add src/main.py
git commit -m "Wire main entry point orchestrating one prompt/reply cycle"
```

---

## Task 13: README with usage and crontab example

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README**

Write to `README.md`:

````markdown
# daily-thoughts

A small cron-triggered script that posts a prompt to a Telegram chat, waits
for your reply, and stores the prompt/reply in a local SQLite database.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env with your bot token, chat id, etc.
```

### Getting your bot token and chat id

1. Talk to `@BotFather` on Telegram, create a bot, copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Start a chat with your bot (send it any message), then visit
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` to find your
   `chat.id`. Put that into `TELEGRAM_CHAT_ID`.

## Running once (manual)

```bash
python -m src.main
```

The bot posts the generated prompt, then waits up to
`REPLY_TIMEOUT_SECONDS` for you to **reply** to that message in Telegram
(tap-and-hold → Reply). The result is written to `data/thoughts.db`.

## Scheduling via cron

Example crontab line (runs daily at 9:00 AM):

```cron
0 9 * * * cd /absolute/path/to/daily-thoughts && /absolute/path/to/.venv/bin/python -m src.main
```

Edit your crontab with `crontab -e`. Cron mails stderr to your local
user, so errors surface naturally.

## Tests

```bash
python -m pytest
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document setup, manual run, and crontab scheduling"
```

---

## Task 14: Full test sweep

**Files:** (none modified)

- [ ] **Step 1: Run the full suite**

Run: `python -m pytest -v`
Expected: all tests pass. Tally should be at least: 6 (config) + 1 (prompts) + 6 (db) + 8 (telegram) = 21 passed.

- [ ] **Step 2: If any failures, fix and re-run**

Address any issues. Once green, proceed.

- [ ] **Step 3 (optional, manual): End-to-end smoke test**

This requires a real bot token and chat. Skip if you don't want to spend the time now.

1. Fill in real values in `.env`.
2. `python -m src.main`
3. On your phone, open the chat with the bot, **reply** to its prompt with some text.
4. Watch the script exit 0.
5. Inspect the row:

```bash
sqlite3 data/thoughts.db "SELECT * FROM thoughts ORDER BY id DESC LIMIT 1;"
```

Expected: one row with your prompt, your reply, `status='replied'`, and both timestamps populated.
