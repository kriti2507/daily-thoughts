# Manual

Operational guide for daily-thoughts.

All commands assume the repo lives at:

```
/Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts
```

## 1. Running manually

From the repo root (the `cd` matters — `python -m src.main` only finds the `src` package when cwd is the repo root):

```bash
cd /Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts
.venv/bin/python -m src.main
```

The bot posts the generated prompt to your Telegram chat and waits up to `REPLY_TIMEOUT_SECONDS` for a reply.

**To respond:** tap-and-hold (or right-click) the bot's message in Telegram → **Reply** → type your reply → send. Plain messages in the chat will be ignored — only true replies match.

The script exits 0 when it either captures a reply (`status='replied'`) or the timeout elapses (`status='timed_out'`). Either way, one row is inserted into `data/thoughts.db`. Inspect it with:

```bash
sqlite3 data/thoughts.db "SELECT id, status, sent_at, substr(response, 1, 60) FROM thoughts ORDER BY id DESC LIMIT 10;"
```

## 2. Setting up cron and changing the schedule

### Install (or replace) the crontab entry

The current entry runs every 3 minutes and appends stdout/stderr to `data/cron.log`. To install or change it, write the desired line to a temp file and pipe it in:

```bash
printf '%s\n' '*/3 * * * * cd /Users/kritiagarwal/Documents/daily_thoughts/daily-thoughts && .venv/bin/python -m src.main >> data/cron.log 2>&1' | crontab -
```

Verify:

```bash
crontab -l
```

### Changing the schedule

Replace the `*/3 * * * *` portion with whatever cron expression you want, then re-run the `printf | crontab -` command above. Common examples:

| Schedule          | Cron expression       |
| ----------------- | --------------------- |
| Every 3 minutes   | `*/3 * * * *`         |
| Every 15 minutes  | `*/15 * * * *`        |
| Every hour, on :00 | `0 * * * *`          |
| Every 6 hours     | `0 */6 * * *`         |
| Daily at 9:00 AM  | `0 9 * * *`           |
| Daily at 9:00 PM  | `0 21 * * *`          |

If you want to edit the crontab interactively instead, run `crontab -e` (uses `$EDITOR`, usually vi).

### macOS gotcha — Full Disk Access

On macOS Catalina+, `/usr/sbin/cron` needs Full Disk Access to read files in your home directory. Set this once: System Settings → Privacy & Security → Full Disk Access → `+` → `Cmd+Shift+G` → `/usr/sbin/cron` → Add. Without this, cron fires silently but nothing happens.

## 3. Changing the reply timeout

Edit `.env`:

```
REPLY_TIMEOUT_SECONDS=180
```

The value is in seconds. No restart needed — the next run (manual or cron) reads `.env` fresh.

Typical values:
- `180` — 3 minutes (testing cadence)
- `1800` — 30 minutes
- `3600` — 1 hour (default)

Note: the script process stays alive for up to the timeout. If you run cron more frequently than the timeout (e.g. `*/3 * * * *` with `REPLY_TIMEOUT_SECONDS=3600`), runs will overlap. Each run has its own message_id, so they can't cross-contaminate replies, but you will see multiple python processes running concurrently.

## 4. Stopping it

### Stop scheduled (cron) runs

Remove your entire crontab:

```bash
crontab -r
```

(Safe here because daily-thoughts is your only entry. If you ever have other cron jobs, use `crontab -e` and delete just the daily-thoughts line.)

Verify nothing is scheduled:

```bash
crontab -l
# expected: "crontab: no crontab for kritiagarwal"
```

### Kill any currently-running script process

A script can still be alive for up to `REPLY_TIMEOUT_SECONDS` after `crontab -r` if it was already in its polling phase. Find it:

```bash
ps -ef | grep "src.main" | grep -v grep
```

Kill by PID:

```bash
kill <PID>
```

Or kill all matching processes at once:

```bash
pkill -f "src.main"
```

### Pause cron without removing it

If you want to keep the entry but disable it temporarily, prefix it with `#` to comment it out:

```bash
crontab -e
# add a `#` at the start of the daily-thoughts line, save, quit
```

Re-enable by removing the `#`.

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
