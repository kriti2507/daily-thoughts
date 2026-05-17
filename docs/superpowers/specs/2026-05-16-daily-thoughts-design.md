# daily-thoughts — v1 Design

**Date:** 2026-05-16
**Status:** Approved (pending written-spec review)

## 1. Overview

`daily-thoughts` is a small Python script, triggered by the system's cron, that
posts a prompt to a Telegram chat, waits for the user's reply, and stores the
prompt/reply pair in a local SQLite database.

Each cron firing runs the script end-to-end:

1. Load config from `.env`.
2. Call `generate_prompt()` to build a prompt string.
3. Send the prompt to Telegram via `sendMessage`; record the bot's outgoing
   `message_id`.
4. Long-poll Telegram's `getUpdates` for a reply that targets that
   `message_id`, up to a configurable timeout.
5. Insert one row into SQLite with the prompt, the reply (or `NULL`),
   timestamps, and a status of either `replied` or `timed_out`.
6. Exit.

The script is intentionally synchronous and single-process. Cron handles
scheduling; the script handles one prompt/reply cycle. No long-running daemon,
no webhook server.

## 2. File layout

```
daily-thoughts/
├── .env                  # not committed; secrets + config
├── .env.example          # committed template
├── .gitignore
├── README.md
├── requirements.txt
├── data/
│   └── thoughts.db       # SQLite file (gitignored)
└── src/
    ├── __init__.py
    ├── main.py           # entry point — orchestrates one run
    ├── config.py         # loads .env into a typed Config object
    ├── prompts.py        # generate_prompt() — hard-coded for v1
    ├── telegram.py       # send_message(), poll_for_reply()
    └── db.py             # init schema, insert_thought()
```

### Module responsibilities

- **`main.py`** — wires the pieces together; no business logic of its own.
- **`config.py`** — single source of truth for env vars; fails fast with a clear
  error if any are missing.
- **`prompts.py`** — exports `generate_prompt() -> str`. v1 returns a single
  hard-coded string. Implementation is expected to be replaced later
  (LLM-generated, curated rotation, etc.) without touching the rest of the app.
- **`telegram.py`** — thin wrapper around the two HTTP endpoints we need
  (`sendMessage`, `getUpdates`). No knowledge of the database.
- **`db.py`** — schema creation (idempotent via `CREATE TABLE IF NOT EXISTS`,
  run on each invocation) and one insert function. No knowledge of Telegram.

## 3. Data flow (one run)

```
cron fires
   │
   ▼
main.py
  1. config = load_config()                          # .env → Config
  2. db.init(config.db_path)                         # CREATE TABLE IF NOT EXISTS
  3. prompt = generate_prompt()                       # str
  4. sent_at = now()
     msg_id = telegram.send_message(prompt)          # returns Telegram message_id
  5. reply = telegram.poll_for_reply(                 # blocks up to timeout
         reply_to_message_id=msg_id,
         timeout_seconds=config.reply_timeout_seconds,
     )                                                # returns (text, received_at) or None
  6. if reply:
         db.insert_thought(prompt, sent_at, msg_id,
                           response=reply.text,
                           responded_at=reply.received_at,
                           status='replied')
     else:
         db.insert_thought(prompt, sent_at, msg_id,
                           response=None, responded_at=None,
                           status='timed_out')
  7. exit 0
```

### Polling behavior

`poll_for_reply` uses Telegram's long-polling `getUpdates` endpoint:

1. **Drain phase:** before polling, the function calls `getUpdates` with a high
   `offset` to discard all pending updates accumulated between runs. This means
   any chatter that happened *between* prompts is never observed by the
   script.
2. **Poll loop:** the function then issues long-poll `getUpdates` calls (each
   with Telegram's `timeout` parameter, up to 50s per call), advancing the
   `offset` after each batch. Each new update is checked: if its
   `reply_to_message.message_id` equals the prompt's `msg_id`, it's a match
   and is returned. Other updates are ignored.
3. **Timeout:** the loop exits when cumulative wall-clock time exceeds
   `config.reply_timeout_seconds`, returning `None`.

**No fallback for "any message in the chat" in v1.** Replies must use
Telegram's native reply feature (tap-and-hold → Reply). This avoids
mis-capturing unrelated messages sent during the polling window. We may
revisit if it proves awkward in practice.

## 4. Configuration

A `.env` file at the repo root holds all runtime config. The file itself is
gitignored; `.env.example` is committed as a template. `python-dotenv` loads
it.

```
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...        # from @BotFather
TELEGRAM_CHAT_ID=987654321                  # the chat the bot posts to

# Polling
REPLY_TIMEOUT_SECONDS=3600                  # default 1 hour

# Storage
DB_PATH=data/thoughts.db                    # relative paths resolved from repo root
```

`config.py` loads these into a frozen dataclass:

```python
@dataclass(frozen=True)
class Config:
    telegram_bot_token: str
    telegram_chat_id: int
    reply_timeout_seconds: int
    db_path: Path
```

Missing or unparseable values raise a clear error and exit before any HTTP
call to Telegram (fail fast).

**The cron schedule itself is not in `.env`.** Cron is the trigger; the app
can't enforce a schedule. The README will include an example crontab line.

## 5. Database schema

```sql
CREATE TABLE IF NOT EXISTS thoughts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt              TEXT    NOT NULL,
    response            TEXT,                            -- NULL if timed out
    sent_at             TEXT    NOT NULL,                -- ISO-8601 UTC
    responded_at        TEXT,                            -- NULL if timed out
    status              TEXT    NOT NULL CHECK (status IN ('replied','timed_out')),
    telegram_message_id INTEGER NOT NULL
);
```

- Timestamps are ISO-8601 UTC strings, SQLite's portable, human-readable
  convention.
- The row is written **once at the end of the run**, not at send time. There
  is no `pending` status in v1: if the script crashes between sending and
  writing, that row is lost. Acceptable for a personal tool — the user will
  notice the bot posted but nothing was stored.
- The schema is expected to change in future versions.

## 6. Error handling

Scaled to a personal cron script. All errors print to stderr; cron mails
stderr output to the local user, which is the natural notification channel.

| Failure                                            | Behavior                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.env` missing or invalid                          | Exit 1 with a clear message **before** any Telegram call.                                      |
| Telegram `sendMessage` fails (network, auth, 4xx)  | Log the error, exit 1. Nothing written to the database. No retries.                            |
| `getUpdates` fails mid-poll (transient network)    | Retry up to 3 times with short backoff. On persistent failure, write the row as `timed_out`.   |
| Reply timeout                                      | Write row as `timed_out`. Exit 0.                                                              |
| DB write fails                                     | Log the error, exit 1.                                                                         |

## 7. Testing

Proportional to project size. v1 uses `pytest`, with files in `tests/`
mirroring `src/`.

- **`prompts.py`** — trivial unit test: `generate_prompt()` returns a non-empty
  string. Mainly a placeholder so the test scaffold exists when the function
  is replaced later.
- **`db.py`** — unit tests against a temp-file SQLite database: schema init is
  idempotent; `insert_thought` round-trips correctly for both `replied` and
  `timed_out` rows.
- **`config.py`** — unit tests: missing required keys raise; a valid `.env`
  parses to the right dataclass values.
- **`telegram.py`** — unit tests with `requests` mocked: `send_message` builds
  the right URL/payload and returns the parsed `message_id`; `poll_for_reply`
  matches on `reply_to_message_id`, ignores non-matching updates, and times
  out cleanly.
- **No integration test against the real Telegram API** in v1. Manual smoke
  test (run the script, reply on phone, check the row) is sufficient.

## 8. Dependencies

- `requests` — HTTP client for the Telegram API.
- `python-dotenv` — loads `.env` into the process environment.
- `pytest` (dev) — test runner.

Everything else (`sqlite3`, `dataclasses`, `pathlib`, `json`, `time`,
`logging`) is in the standard library.

## 9. Out of scope for v1

These are explicitly *not* in v1; recording them so they don't sneak in:

- Webhook-based reply ingestion.
- A long-running listener / daemon process.
- Fallback matching of non-reply messages.
- LLM-generated prompts (the stub structure makes this trivial to add later).
- Persisting Telegram `update_id` offsets between runs (each run drains).
- Modifying or post-processing the saved response (stored verbatim).
- Multi-chat or multi-user support.
- Web UI or any read interface beyond the SQLite file itself.
