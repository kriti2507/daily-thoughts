# Classify Entries — Design

**Date:** 2026-10-02
**Status:** Approved

## Summary

Every entry, both thoughts and check-in answers, is classified into a set of
categories I choose, using TypeSafe's Jev model. A cloud or post-it shows the
categories it fits as small tapes.

Patterns and analysis are not part of this. On Day 7 an MCP server lets Claude
read the entries and their categories, and write an analysis back to the page.

**Done when:** I write a thought, and a moment later it shows its categories on
the page.

## Decisions

- **Categories are mine to edit**, like questions. The `/questions` page gets a
  Categories section that adds, rewords, reorders, and retires them. They are
  never deleted, only retired.
- **Multi-label: one Jev Noul per category.** A thought can be both anxious and
  about work, so each active category is its own yes/no question. All of them
  go in one request and run in parallel. The raw probability is stored, and code
  decides what counts as a match (`p >= 0.5`). Changing that threshold never
  needs a re-run.
- **Answers are classified with their prompt.** The state is
  `{ prompt, entry }` for an answer and `{ entry }` for a thought.
- **Classification never blocks a save.** It runs with Next's `after()` once
  the response has gone out. A Jev failure is logged and the entry stays
  pending.
- **"Pending" is computed, not tracked.** An entry is pending when some active
  category has no result for it newer than both the category's last edit and
  the entry's last edit. So a new or reworded category, an edited answer, or an
  earlier failure all reclassify on their own. Each run handles a bounded batch.
- **Backfill is a button.** The Categories section shows how many entries are
  pending and has a "Classify now" button. This covers old entries without a
  script.
- **Categories are private.** Visitors see thoughts but not their categories.
- **The API key is server-only.** `TYPESAFE_API_KEY` goes in `.env` and in
  Vercel. Without it, classification is skipped and the page says so.

## Data model

```sql
CREATE TABLE categories (id, text, position, retired_at, created_at, updated_at);
CREATE TABLE classifications (
  message_id  → messages ON DELETE CASCADE,   -- exactly one of these two
  answer_id   → answers  ON DELETE CASCADE,
  category_id → categories,
  probability REAL,          -- Jev's P(yes)
  classified_at TIMESTAMPTZ, -- when the entry and category were read
  UNIQUE (message_id, category_id), UNIQUE (answer_id, category_id)
);
```

Starter categories: anxiety or worry, self-doubt, work, relationships, health
and body, gratitude and wins, catastrophising, planning and the future.
