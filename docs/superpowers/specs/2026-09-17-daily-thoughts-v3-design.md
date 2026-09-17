# Daily Thoughts v3 — Design

**Date:** 2026-09-17
**Status:** Approved
**Supersedes:** [v2 design](2026-05-16-daily-thoughts-v2-design.md)

## Summary

Collapse the project to a single pipeline: you write a message in a Telegram
chat, and it appears on the main page. Nothing else.

v2 was a cron-triggered Python script that asked an LLM to generate a
reflection question, posted it to Telegram, long-polled for a reply, asked the
LLM to categorize that reply into a mood plus twelve per-goal fields, wrote the
result to SQLite, and served it through a FastAPI backend to a six-card Next.js
dashboard. v3 removes every one of those stages except "message in, message
out".

The result is one Next.js app deployed to Vercel, backed by Postgres.

## Architecture

```
Telegram chat
     │  POST (Telegram pushes; we never poll)
     ▼
/api/telegram/webhook ──INSERT──▶ Postgres.messages
                                        │
                                        │ SELECT
                                        ▼
                                   /  (main page)
```

Two moving parts, no background process:

1. **`POST /api/telegram/webhook`** — a Next.js route handler. Telegram POSTs
   every update to it. The handler verifies the shared secret, filters to the
   owner's chat, inserts the message, and returns `200`.
2. **`/`** — a server component. Reads the most recent messages from Postgres
   and renders them as a flat list, newest first.

Telegram cannot write to a database directly; it only makes HTTPS POSTs. The
webhook route is that POST target. Because it runs as a Vercel serverless
function, there is nothing to keep alive between messages — which is what makes
the no-poller requirement satisfiable.

### Why not a poller

v2's `telegram.poll_for_reply` held a process open for the duration of the
`REPLY_TIMEOUT_SECONDS` window. That model cannot deploy to Vercel, which has
no always-on compute. Webhooks invert the direction: Telegram initiates, we
respond and exit.

## Data model

A single table. One row per Telegram text message.

```sql
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL    PRIMARY KEY,
  telegram_id BIGINT       NOT NULL,
  chat_id     BIGINT       NOT NULL,
  text        TEXT         NOT NULL,
  sent_at     TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages (sent_at DESC, id DESC);
```

- **`sent_at`** is derived from Telegram's `message.date` (a Unix timestamp), not
  from server clock time. The page therefore shows when you wrote the thought,
  not when the function happened to run.
- **`created_at`** records ingestion time, for debugging delivery lag.
- **`UNIQUE (chat_id, telegram_id)`** provides idempotency. Telegram redelivers
  any update it does not receive a `2xx` for, so the insert uses
  `ON CONFLICT DO NOTHING` and a redelivery is a no-op rather than a duplicate
  row.

The schema lives in `db/schema.sql` and is applied by `npm run db:init`. No
migration framework at this stage — there is one table and no existing data to
preserve (`data/` was gitignored and never committed).

## Components

### `src/lib/db.ts`

Owns the Postgres connection and nothing else. Exports a single `sql` client
from the `postgres` package (postgres.js), cached across warm serverless
invocations via a module-level singleton so repeated requests reuse one
connection.

`postgres` is chosen over a vendor-specific driver so `DATABASE_URL` can point
at Neon, Supabase, RDS, or a local instance without a code change.

Depends on: `DATABASE_URL`.

### `src/lib/messages.ts`

The only module that writes SQL. Two functions:

- `insertMessage({ telegramId, chatId, text, sentAt })` — `INSERT … ON CONFLICT
  DO NOTHING`.
- `listMessages(limit)` — `SELECT … ORDER BY sent_at DESC LIMIT $1`.

Keeping both queries here means the route handler and the page never build SQL,
and the webhook tests can mock one module.

Depends on: `src/lib/db.ts`.

### `src/app/api/telegram/webhook/route.ts`

The `POST` handler. Its entire job is validate → filter → insert → `200`.

| Condition | Response | Reason |
|---|---|---|
| `X-Telegram-Bot-Api-Secret-Token` missing or ≠ `TELEGRAM_WEBHOOK_SECRET` | `401` | The endpoint is publicly reachable; the secret is what proves the caller is Telegram. |
| `message.chat.id` ≠ `TELEGRAM_CHAT_ID` | `200`, ignored | Anyone who finds the bot can message it. Their messages must not reach the page. |
| No `message.text` (photo, sticker, edit, channel post, other update types) | `200`, ignored | Out of scope for the base layer. |
| Valid text message from the owner | `200`, inserted | The happy path. |

Ignore paths deliberately return `200`, not `4xx`. Telegram retries any update
that fails, so returning an error for a message we intend to drop would make
Telegram redeliver it indefinitely.

The handler returns `200` even if the insert throws, after logging — a failed
insert that triggers infinite retries is worse than a lost message.

Depends on: `src/lib/messages.ts`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`.

### `src/app/page.tsx`

Server component, `export const dynamic = "force-dynamic"` so it never serves a
stale cache. Calls `listMessages(100)` and renders a flat list, newest first,
each entry stamped with full date and time. Empty state when there are no
messages yet.

This is explicitly a base layer. Grouping, pagination, search, and richer
presentation are future work and are not designed here.

Depends on: `src/lib/messages.ts`.

### `scripts/set-webhook.mjs`

Plain JavaScript rather than TypeScript, so `node --env-file=.env` runs it with
no build step or extra dependency on Node 20.

`npm run webhook:set -- <https://your-app.vercel.app>` calls Telegram's
`setWebhook` with that URL plus the `secret_token` from `.env`, and prints the
response. Re-runnable whenever the deployment URL changes.

Depends on: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

## Repository layout

The Next.js app moves from `frontend/` to the repository root via `git mv`, so
Vercel needs no Root Directory configuration. With Python gone, the app *is* the
project.

Note the ordering: the Python `src/` is deleted first, then `frontend/src/`
moves into the vacated `src/`. Every `src/…` path elsewhere in this document
refers to the post-move Next.js tree unless it is explicitly labelled Python.

### Removed

| Path | Why |
|---|---|
| `src/` (Python: `main.py`, `llm.py`, `goals.py`, `telegram.py`, `db.py`, `config.py`) | The entire cron → LLM → poll → categorize pipeline. |
| `api/` (FastAPI server + tests) | Replaced by the Next.js route handler. |
| `tests/` (pytest) | Tests for deleted Python modules. |
| `requirements.txt` | No Python runtime. |
| `goals.md` | Goals were input to the deleted LLM prompt. |
| `src/components/dashboard/*` (6 cards) | Mood, streak, weekly grid, goal clarity, chart, recent entries — all derived from deleted categorization data. |
| `src/lib/api.ts` | Fetched the deleted FastAPI endpoints. |
| `src/components/ui/progress.tsx`, `badge.tsx`, `button.tsx`, `card.tsx` | All four are dead code: a grep of the app shows none of them is imported anywhere, even today. |

`recharts` and any other dependency left with no importer is dropped from
`package.json`.

### Kept

The layout shell (`layout.tsx`), theme provider and toggle, `lib/utils.ts`, and
`globals.css` with its existing warm/amber palette. The visual language carries
over; only the content changes. The message list styles itself from the same CSS
variables, so it needs no component library.

### Rewritten

`README.md` and `manual.md` — both currently document cron, the venv, the
reply-to-message interaction, and `sqlite3` inspection commands, none of which
exist in v3.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `TELEGRAM_BOT_TOKEN` | Used by `set-webhook`. |
| `TELEGRAM_CHAT_ID` | The only chat whose messages are stored. |
| `TELEGRAM_WEBHOOK_SECRET` | Random string; verified on every webhook request. |
| `DISPLAY_TIME_ZONE` | Optional IANA zone for rendered timestamps. Defaults to `UTC`. |

Every v2 variable not listed here is removed: `REPLY_TIMEOUT_SECONDS`,
`DB_PATH`, `GOALS_PATH`, `HISTORY_DAYS`, `LLM_PROVIDER`, `LLM_MODEL`,
`ANTHROPIC_API_KEY`.

Configuration is read through `src/lib/env.ts`, which throws
`Missing required environment variable: X` on first access to anything unset or
empty. Reading through an accessor rather than at module load is deliberate: it
lets the webhook tests stub the secret and chat id per case, and an unset
variable still fails loudly rather than silently comparing against `undefined`.

`DISPLAY_TIME_ZONE` exists because a Vercel function's clock is UTC, so
formatting timestamps in the server's local zone would display the wrong time.
Formatting server-side against an explicit zone keeps the page free of client
JavaScript and avoids a hydration mismatch. Moving formatting to the viewer's
own locale is reasonable later work.

## Error handling

| Failure | Behavior |
|---|---|
| Unauthorized webhook caller | `401`, nothing written. |
| Webhook payload is not a text message from the owner | `200`, nothing written. |
| Telegram redelivers an update | `ON CONFLICT DO NOTHING`; no duplicate row. |
| Database unreachable during webhook | Log the error, return `200`. That message is lost; the alternative is unbounded Telegram retries. |
| Database unreachable during page render | Render an error state — distinct in wording from the no-messages-yet empty state — rather than a crashed page. |

## Testing

Vitest against the webhook handler, with `src/lib/messages.ts` mocked. Four
cases, each covering a path that is impractical to verify by hand:

1. Missing or wrong secret header → `401`, no insert attempted.
2. Message from a chat other than `TELEGRAM_CHAT_ID` → `200`, no insert.
3. Update with no `message.text` → `200`, no insert.
4. Valid message → `200`, `insertMessage` called with the parsed fields, and
   `sent_at` converted correctly from Telegram's Unix `date`.

The page is not unit-tested at this stage; it is a `SELECT` and a `map`.

## Out of scope

Deliberately excluded from the base layer, listed so the boundary is explicit:
non-text messages, message edits and deletions, pagination or infinite scroll,
search, date grouping, multi-user support, and any authentication on the page
itself.
