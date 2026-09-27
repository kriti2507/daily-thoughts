# Manual

Operational notes for daily-thoughts. All commands run from the repository root.

## Checking what Telegram thinks the webhook is

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | jq
```

`pending_update_count` above zero with a `last_error_message` means Telegram is
retrying against a failing endpoint. `url` should match your deployment.

## Re-pointing the webhook

Vercel preview URLs change per deployment; the production URL does not. After
changing domains:

```bash
npm run webhook:set -- https://your-app.vercel.app
```

## Removing the webhook

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

## Inspecting stored messages

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, sent_at, left(text, 60) FROM messages ORDER BY sent_at DESC LIMIT 10;"
```

## Messages are missing

Work through it in this order:

1. `getWebhookInfo` — is Telegram delivering, and is it reporting an error?
2. Vercel function logs for `/api/telegram/webhook` — a `401` means the secret
   in the Vercel environment does not match the one registered with Telegram.
3. A `500` in those logs, with `Environment variable must be a number:
   TELEGRAM_CHAT_ID` — `TELEGRAM_CHAT_ID` is set to something non-numeric.
   Alarming-looking, one-line fix: correct the value in the Vercel environment.
4. A `500` with `Missing required environment variable:
   TELEGRAM_WEBHOOK_SECRET` (or any other name) — that variable is unset in the
   Vercel environment. Every webhook call fails until it is set.
5. `failed to store telegram message` in the logs — the handler ran but the
   database rejected the write. That message is lost by design; the handler
   returns `200` rather than letting Telegram retry indefinitely.
6. Messages sent from a chat other than `TELEGRAM_CHAT_ID` are dropped
   silently, by design.

## Re-applying the schema

`db/schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`), so it is safe to
re-run at any time:

```bash
npm run db:init
```
