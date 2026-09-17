# daily-thoughts

Write a message to your Telegram bot; it shows up on your page.

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

## Deploying

Deploy to Vercel, set the four environment variables in the project settings,
then register the webhook against the deployed URL:

```bash
npm run webhook:set -- https://your-app.vercel.app
```

## Tests

```bash
npm test
```

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `TELEGRAM_BOT_TOKEN` | yes | Used by `webhook:set`. |
| `TELEGRAM_CHAT_ID` | yes | The only chat whose messages are stored. Must be numeric. |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Verified on every webhook request. |
| `DISPLAY_TIME_ZONE` | no | IANA zone for timestamps. Defaults to `UTC`; an invalid zone falls back to `UTC` with a logged warning. |
