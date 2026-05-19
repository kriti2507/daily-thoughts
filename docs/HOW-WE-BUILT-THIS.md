# How We Built This

A meta-document on how `daily-thoughts` was built end-to-end using Claude Code and the Superpowers plugin. Useful if you want to reproduce a similar project — or use this repo as a teaching example.

## TL;DR

The pattern that worked was a **3-stage workflow per version**, repeated for v1 and v2:

1. **Brainstorm** — clarify the design through one-question-at-a-time dialogue
2. **Plan** — turn the design into a TDD task list
3. **Execute** — dispatch subagents per task with automatic review

Each stage maps to one Superpowers skill. Your job is mostly answering questions honestly and picking when offered choices. The skills drive the structure.

End-to-end, both versions together took roughly an hour of conversation, with the heavy lifting happening in background subagent dispatches.

## Prompts to write (in order)

### Stage 0 — Setup

Start in an empty git repo. Optional `CLAUDE.md` at the repo root if you have strong preferences ("be terse", "use TDD", etc.).

### Stage 1 — Brainstorm (the opening prompt)

One paragraph stating intent. **Don't pre-specify details** — the skill will surface them.

The actual v1 opening prompt:

> Develop a very simple system with a db and an app. The app runs every X hours or every day depending on a cron schedule. The app sends a prompt to Telegram and saves the response in the db. Create an environment file for Telegram API details.

Claude invokes `superpowers:brainstorming` and starts asking **one clarifying question at a time**. The questions surface ambiguities you didn't know you had — e.g. *"does 'response' mean the API ack, or the human's reply?"*. You answer; Claude proposes 2-3 architectural options with a recommendation; you pick. The stage ends with a committed `docs/superpowers/specs/<date>-design.md`.

### Stage 2 — Plan

Just say `"looks good, write it up"`. Claude invokes `superpowers:writing-plans` and produces `docs/superpowers/plans/<date>-<feature>.md` with TDD-style tasks:

```
write failing test → run it → implement → verify pass → commit
```

Skim the plan; push back on anything wrong.

### Stage 3 — Execute

When offered an execution mode, pick **Subagent-Driven**. Claude invokes `superpowers:subagent-driven-development`, which dispatches a fresh subagent per task plus two review subagents (spec compliance, then code quality) per task. Your main session stays clean.

### For follow-on versions

Repeat the whole loop. The v2 opening prompt was:

> I want to add more complexity. Claude (api details in `.env`) reads `goals.md` and the last 7 days of answers, asks specific questions, then categorizes my answer. Goals are static (3). Categories like mood, clarity, goal on track. **What's missing?**

The `what's missing?` framing is useful — it asks Claude to surface gaps before the brainstorm proper.

## Skills used

| Skill | Role | Stage |
| --- | --- | --- |
| `superpowers:using-superpowers` | Loaded at session start; teaches Claude to invoke other skills | Auto |
| `superpowers:brainstorming` | Drives design dialogue → spec doc | 1 |
| `superpowers:writing-plans` | Produces TDD task plan | 2 |
| `superpowers:subagent-driven-development` | Dispatches implementer + reviewers per task | 3 |
| `superpowers:test-driven-development` | Subagents follow this inside Stage 3 | Auto |
| `superpowers:requesting-code-review` | Review template used by reviewer subagents | Auto |

All are part of the Superpowers plugin in Claude Code. Listed under `/skills`.

## System design that emerged

### v1 — minimal viable loop

- Cron triggers `python -m src.main` on a schedule
- One-shot script: load `.env` → generate prompt → Telegram `sendMessage` → long-poll `getUpdates` until human reply (matched by `reply_to_message.message_id`) or timeout → insert one SQLite row → exit
- Modules with one responsibility each:
  - `config` — env loading
  - `prompts` — generation (stub in v1)
  - `telegram` — two API endpoints wrapped
  - `db` — schema + insert
  - `main` — orchestration
- Tests mock at the `requests` boundary

### v2 — goal-aware reflection loop

Extends v1 with:

- `goals.md` at repo root (3 H2 headings, parsed by `src/goals.py`)
- `src/llm.py` with an `LLMClient` Protocol + `AnthropicLLMClient` + factory keyed on `LLM_PROVIDER` env var (so a local-LLM backend can slot in later)
- Two Claude API calls per run:
  - `generate_question` — plain text out
  - `categorize` — Anthropic tool-use with forced `tool_choice` for guaranteed structured JSON
- 13 nullable categorization columns added to the schema:
  - `mood` (enum: `good` / `bad` / `neutral`)
  - For each of goal 1, 2, 3: `clarity`, `done_today`, `something_good`, `something_bad`
- `db.fetch_recent_replied(days=7)` feeds the LLM history
- Failure modes: `generate_question` fails → skip the run (exit 0); `categorize` fails → keep the row, NULL categories

## Practical tips

- **Don't pre-specify too much.** A one-paragraph intent is enough. Front-loading decisions skips the dialogue and locks in unexamined assumptions.
- **Answer one question per turn.** The brainstorm is intentionally serial. Resist the urge to batch.
- **Push back.** When Claude proposes something you don't want, say so. v1's "no fallback for non-reply messages" came from a mid-design correction.
- **Treat each version as a fresh loop.** v2 wasn't a continuation of v1's execution — it was a new brainstorm → spec → plan → execute cycle, with v1 code as context.
- **Let subagents commit frequently.** The plan tells them to commit per task. You want granular history for review.
- **Trust the reviews.** The two-stage review per task (spec then quality) catches drift before it compounds.

## Repo artifacts produced by the workflow

You can read the actual outputs of each stage in this repo:

- Specs: `docs/superpowers/specs/`
  - `2026-05-16-daily-thoughts-design.md` (v1)
  - `2026-05-16-daily-thoughts-v2-design.md` (v2)
- Plans: `docs/superpowers/plans/`
  - `2026-05-16-daily-thoughts-v1.md`
  - `2026-05-16-daily-thoughts-v2.md`
- Implementation: `src/`
- Operational manual: `manual.md`

The `git log` between the v1 spec commit and the v1 final-review commit (and similarly for v2) shows the per-task commits that subagents produced.
