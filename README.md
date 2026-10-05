# daily-thoughts

Write a message to your Telegram bot, or on the page itself; it shows up on your page.

Telegram POSTs each message to a Next.js route, which stores it in Postgres.
The main page reads Postgres. No cron, no polling, no background process.

## Setup

1. Create a bot with [@BotFather](https://t.me/botfather) and copy the token.
2. Message the bot once, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat.id`.
3. Create a Postgres database (Neon, Supabase, or local).
4. Copy `.env.example` to `.env` and fill it in. Generate the webhook secret
   with `openssl rand -hex 32`.
5. Install and initialise:

   ```bash
   npm install
   npm run db:init
   ```

## Running locally

```bash
npm run dev
```

Telegram cannot reach `localhost`, so to exercise the webhook locally either
expose the port (`ngrok http 3000`) and point the webhook at that URL, or POST
an update yourself:

```bash
curl -X POST localhost:3000/api/telegram/webhook \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" \
  -d '{"message":{"message_id":1,"date":1757000000,"text":"hello","chat":{"id":YOUR_CHAT_ID}}}'
```

Replace `YOUR_CHAT_ID` with the numeric id from step 2. Left as-is the body is
invalid JSON, and the handler answers `200` without storing anything — every
ignore path returns `200` so that Telegram stops retrying, so a `200` here is
not by itself proof the message landed.

## Deploying

Deploy to Vercel, set the four required environment variables in the project
settings, then register the webhook against the deployed URL:

```bash
npm run webhook:set -- https://your-app.vercel.app
```

When upgrading an existing deployment, run `npm run db:init` against the
production `DATABASE_URL` **before** deploying the new code. It's idempotent,
and the old code keeps working on the new schema. The reverse order breaks:
new code on the old schema silently drops incoming Telegram messages.

## Writing and deleting from the page

Set `ADMIN_SECRET` (e.g. `openssl rand -hex 32`), then visit
`/admin?key=<ADMIN_SECRET>` once in your browser. That sets a cookie, and with
it a **New thought** button appears in the header (or press `n`) and a delete button on each
cloud. Entries written on the page are stored alongside Telegram ones and
labelled "via web". Deleting removes the row from Postgres permanently. Without
the cookie the page stays read-only; with `ADMIN_SECRET` unset, both are off
entirely. Rotating the secret signs out every browser.

## Daily check-in

Each day is a page: that day's thoughts float as clouds in a "sky", and, when
you're logged in as admin, its check-in sits below as post-its on a "board".
Move between days with the tear-off calendar (top right on desktop; its
calendar button opens the month), the timeline dock at the bottom on phones,
←/→ or a sideways swipe.
`t` jumps to today. Today's post-its are blank notes you write on; "Stick it"
(or ⌘/Ctrl+Enter) saves them, and you can edit until midnight
Japan time (JST), after which they're read-only. Blank answers are skipped.
Drag a note by its tape (desktop) to rearrange the board on any day. Pick one
sticker for today to mark the mood; it shows on the calendar and the dock.

The `calm · loud` switch in the header swaps the loud Riso Pop look for the
quieter Sage Morning one, which also goes dark when your system is in dark
mode.

Manage the questions at `/questions` (the checklist icon in the header). You
can add, reword, reorder and retire them. Each answer keeps a copy of the
wording it was given, so rewording or retiring a question never changes past
days. Check-ins are private: visitors see the calendar and thoughts, but not
your answers, stickers, or which days had a check-in.

## Categories

Every thought and check-in answer is sorted into categories by
[TypeSafe](https://docs.typesafe.ai)'s Jev model, and shows the ones it fits
as small tapes. An entry can fit several. Set `TYPESAFE_API_KEY` to turn it
on. Without it, nothing is classified and the page works as before.

Manage the categories on `/questions`, below the questions. Adding or
rewording a category sorts every entry again. An entry is classified just
after it's saved, without slowing the save down. For older entries, and after
editing categories, the Categories section shows how many are waiting, and
**Classify now** handles them a batch at a time. Like check-ins, categories
are private: visitors never see them.

## Asking Claude about your data (MCP)

The app is also an [MCP](https://modelcontextprotocol.io) server at `/mcp`,
so Claude (or any MCP app) can read your journal and answer questions about
it. It has one read-only tool, `get_data`, which returns everything grouped by
day: thoughts with their times, check-in questions (as worded that day) and
answers, the day's sticker, and each entry's categories. It can be narrowed
to a date range. Nothing can be written or deleted through it.

It needs `ADMIN_SECRET`. When an app connects, your browser opens a consent
page showing where you'll be sent after allowing (e.g. **claude.ai**). Only
allow if that matches the app you started from, and enter `ADMIN_SECRET` as
the password. Rotating `ADMIN_SECRET` disconnects every app, along with every
browser.

- **claude.ai** (also desktop and mobile): Settings → Connectors → Add custom
  connector, URL `https://your-app.vercel.app/mcp`, then Connect.
- **Claude Code:**
  `claude mcp add --transport http daily-thoughts https://your-app.vercel.app/mcp`,
  then `/mcp` → `daily-thoughts` → authenticate.

Apps stay connected for 30 days after they're last used. The login is stateless
OAuth with nothing stored, ported from small_wins: every client id, code and
token is signed with a key derived from `ADMIN_SECRET`. Code is in
`src/lib/mcp/` and the `src/app/mcp` and `src/app/oauth` routes.

## Tests

```bash
npm test
```

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `DATABASE_POOL_MAX` | no | Connections each server instance may open. Defaults to `5`, enough for a page's queries to run in parallel. |
| `TELEGRAM_BOT_TOKEN` | yes | Used by `webhook:set`. |
| `TELEGRAM_CHAT_ID` | yes | The only chat whose messages are stored. Must be numeric. |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Verified on every webhook request. |
| `ADMIN_SECRET` | no | Enables writing and deleting from the page, and the MCP server. See [Writing and deleting from the page](#writing-and-deleting-from-the-page) and [Asking Claude about your data](#asking-claude-about-your-data-mcp). |
| `TYPESAFE_API_KEY` | no | Enables sorting entries into categories. See [Categories](#categories). Server-side only. |
All dates and times are in Japan time (`Asia/Tokyo`): where one day ends and
the next begins, the times on the page, and what the MCP server returns. It's
fixed in `src/lib/days.ts`.
