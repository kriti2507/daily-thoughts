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
