# daily-thoughts v2 — Goal-Aware Prompts & Categorized Responses

**Date:** 2026-05-16
**Status:** Approved (pending implementation)
**Builds on:** `2026-05-16-daily-thoughts-design.md` (v1)

## Context

v1 ships a cron-triggered script that posts a hard-coded prompt to Telegram and stores raw replies in SQLite. v2 makes the loop **goal-aware**:

- Three static goals (defined in a `goals.md` the user fills in)
- An LLM generates a context-aware question per run, given the goals + last 7 days of replies
- After the user replies, the LLM categorizes the response into structured fields
- Categorized data lives in the same SQLite, ready for later week-over-week averaging

Constraints:

- LLM provider must be **swappable** via env (Claude now, possibly local LLMs later)
- Failures along the LLM path **should be skipped**, not rescued — averaging over 7 days smooths it out
- Don't over-engineer; pick reasonable defaults where unspecified

## Categorization schema

Per thought row:

- `mood`: one of `'good' | 'bad' | 'neutral'` (global, one per row)

Per goal (×3):

- `clarity`: boolean — is the goal clear to the user right now?
- `done_today`: boolean — did they make progress on it today?
- `something_good`: text — one positive thing for that goal (nullable)
- `something_bad`: text — one thing to fix for that goal (nullable)

## Design decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Schema shape | Flat: 13 categorization columns on `thoughts` | Goals are static (3); flat is simpler than joining a normalized `goal_answers` table for this size |
| Goal identity | Stable slot index (1/2/3), not title | User editing a goal title in `goals.md` keeps historic rows mapped to the same slot |
| LLM abstraction | `LLMClient` Protocol + provider factory in `src/llm.py` | Lets local-LLM backend slot in later without touching `main.py` |
| Structured output | Anthropic **tool-use** with forced `tool_choice` | Most reliable way to get schema-shaped JSON; no parsing failures |
| Question count | One question per run (Claude weaves goals naturally) | Telegram replies work best with one focused question |
| History scope | `status='replied'` rows in the last `HISTORY_DAYS` (default 7) | timed-out rows have no signal; recency window matches user's "averaged over 7 days" |
| Default model | `claude-haiku-4-5-20251001` | Cheap, fast, easily sufficient for closed-form categorization + short question generation |
| Prompt caching | **Skip** in v2 | At 1–2 calls/day with a tiny history block, savings are negligible. Revisit if cost grows. |
| Failure on `generate_question` | Skip the run: log to stderr, **exit 0** (no Telegram, no db row) | Cron doesn't pile up retries; the missed run is averaged away |
| Failure on `categorize` | Insert the row with `response` intact, all categorization columns NULL | Reply text is still useful; missing categories are tolerated |
| `goals.md` invalid / wrong number of goals | Hard error, exit 1 (don't post a prompt without knowing the goals) | Categorization schema is hard-coded for 3 goals — drift would corrupt data |

## File map

### New files

- **`goals.md`** (repo root) — committed template with placeholder goals; user edits the body
- **`src/goals.py`** — parses `goals.md` into a `list[Goal]` (must be exactly 3); exposes `Goal` dataclass `(index: int, title: str, description: str)`
- **`src/llm.py`** — `LLMClient` Protocol with `generate_question()` and `categorize()`; `AnthropicLLMClient` implementation; `make_llm_client(config) -> LLMClient` factory
- **`tests/test_goals.py`** — parser tests (valid, missing, too few, too many, malformed headings)
- **`tests/test_llm.py`** — mock the Anthropic SDK; verify request shape (system prompt, tool definition, tool_choice) + response parsing

### Modified files

- **`src/db.py`**
  - Extend `_SCHEMA` with 13 new nullable columns: `mood`, then `goal{1,2,3}_clarity`, `goal{1,2,3}_done_today`, `goal{1,2,3}_good`, `goal{1,2,3}_bad`
  - Add CHECK on `mood IN ('good','bad','neutral')` when not NULL
  - Extend `insert_thought()` to accept optional `mood` and a categorization dict per goal (all default `None`)
  - Add `fetch_recent_replied(db_path, days: int) -> list[Row]` — returns thoughts with `status='replied'` in the last N days, oldest → newest, including their categorization
- **`src/main.py`** — new flow:
  1. Load config + goals
  2. `init` db
  3. Fetch last N days of history from db
  4. `llm.generate_question(goals, history)` → string. **On exception: log, exit 0.**
  5. Send to Telegram, poll for reply (unchanged)
  6. If reply received: `llm.categorize(response, goals, history)` → `Categorization` dataclass. **On exception: log, set categorization fields to `None`.**
  7. Insert thought (with or without categorization)
- **`src/config.py`** — add env vars: `LLM_PROVIDER` (default `anthropic`), `LLM_MODEL` (default `claude-haiku-4-5-20251001`), `ANTHROPIC_API_KEY` (required when provider is `anthropic`), `GOALS_PATH` (default `goals.md`), `HISTORY_DAYS` (default `7`). Validation: `LLM_PROVIDER='anthropic'` must come with `ANTHROPIC_API_KEY`.
- **`.env.example`** — add the new keys above with placeholder values
- **`requirements.txt`** — add `anthropic>=0.40`
- **`tests/test_db.py`** — update existing tests for new optional columns; add tests for `fetch_recent_replied` (date filtering, ordering, includes categorization columns)
- **`tests/test_config.py`** — add tests for new env vars + provider/key validation
- **Delete `src/prompts.py` and `tests/test_prompts.py`** — superseded by `src/llm.py`
- **`manual.md`** — short addition: how to edit `goals.md`, what each env var does

## `goals.md` template format

```markdown
# Goals

## 1. <Goal title>
<Description: what does this goal mean to you, what does success look like, what's the current target?>

## 2. <Goal title>
<Description>

## 3. <Goal title>
<Description>
```

Parser rules: find H2 lines matching `## <int>. <title>`; body is everything until the next H2 or EOF, trimmed. Exactly 3 goals required. Slot index comes from the leading integer (must be 1, 2, 3).

## LLM module shape

```python
# src/llm.py

@dataclass(frozen=True)
class GoalCat:
    clarity: bool
    done_today: bool
    something_good: str | None
    something_bad: str | None

@dataclass(frozen=True)
class Categorization:
    mood: str                     # 'good' | 'bad' | 'neutral'
    per_goal: dict[int, GoalCat]  # keys: 1, 2, 3

class LLMClient(Protocol):
    def generate_question(self, goals: list[Goal], history: list[dict]) -> str: ...
    def categorize(self, response: str, goals: list[Goal], history: list[dict]) -> Categorization: ...

class AnthropicLLMClient:
    def __init__(self, api_key: str, model: str): ...
    # generate_question -> plain text response from messages API
    # categorize -> uses tool-use with forced tool_choice='record_categorization'

def make_llm_client(config: Config) -> LLMClient:
    if config.llm_provider == 'anthropic':
        return AnthropicLLMClient(config.anthropic_api_key, config.llm_model)
    raise NotImplementedError(f"unknown LLM provider: {config.llm_provider}")
```

The `categorize` tool input schema (Anthropic tool-use) lists exactly the 13 fields, types, and enums. Force `tool_choice={"type": "tool", "name": "record_categorization"}` so the model can only respond by calling the tool.

## System prompts (sketch)

**generate_question:** "You are a coaching assistant. Given the user's three goals and their last N replies (with timestamps + categorizations), ask ONE focused question that will both (a) help them reflect on a goal that needs attention and (b) elicit answers that fill the categorization fields. Keep it under 2 sentences."

**categorize:** "Read the user's reply and produce structured categorization via the provided tool. Be conservative — if a field is unclear, prefer the safer default (`clarity=false`, `done_today=false`, `something_good=null`, `something_bad=null`, `mood='neutral'`)."

## Reuse from v1

- `telegram.send_message` / `poll_for_reply` — unchanged
- `db.init` / `insert_thought` — extended, not replaced
- `config.load_config` — extended
- Test layout / pytest conventions — unchanged

## Failure-handling summary

| Where | Behavior |
| --- | --- |
| `.env` missing/invalid | exit 1, no Telegram traffic (v1 behavior preserved) |
| `goals.md` missing or != 3 goals | exit 1 with a clear error |
| `db.init` fails | exit 1 |
| `llm.generate_question` fails | log to stderr, **exit 0** — nothing sent, nothing stored |
| `telegram.send_message` fails | exit 1 (v1 behavior) |
| `poll_for_reply` raises persistently | treat as timeout, store row with `status='timed_out'` and no categorization |
| `llm.categorize` fails | store row with `status='replied'`, response intact, categorization fields NULL |
| `db.insert_thought` fails | exit 1 (v1 behavior) |

## Out of scope for v2

- Prompt caching (defer until cost matters)
- Local-LLM backend (factory raises `NotImplementedError` for now)
- Dynamic goals / >3 goals (would require normalized schema)
- A reporting CLI to compute averages over 7 days (the data is queryable directly via sqlite)
- Migration logic (the db was just wiped; we're effectively rebuilding fresh)
