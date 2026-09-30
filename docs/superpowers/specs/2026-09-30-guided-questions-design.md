# Guided Questions — Design

**Date:** 2026-09-30
**Status:** Approved

## Summary

A daily check-in on the web app: a set of questions I choose, answered once a
day. Telegram stays for random thoughts. The main page becomes a month calendar;
picking a day shows that day's check-in and that day's thoughts together.

No LLM. This day only records answers; analysis comes on Day 5.

**Done when:** I answer today's questions on the page, and clicking today on the
calendar shows my answers next to that day's thoughts.

## Decisions

- **Questions are mine to edit.** An admin-only `/questions` page adds, rewords,
  reorders, and retires them. Questions are never deleted, only retired.
- **Answers keep their wording.** Each answer stores a copy of the question text
  as it was when answered, so rewording or retiring a question never changes
  the past.
- **One check-in per day, today only.** I can edit today's answers until the day
  ends. Past days are read-only, and missed days can't be filled in.
- **Every question is optional.** A blank answer is simply not stored. A partial
  check-in still counts.
- **A day is a date in `DISPLAY_TIME_ZONE`**, the zone already used to show
  timestamps. No new config.
- **Check-ins are private.** Answers only show when logged in (admin cookie).
  Visitors still see the calendar and thoughts, as now.
- **No reminders** on Telegram or anywhere else.

## Data model

Append to `db/schema.sql`. It stays idempotent, so `npm run db:init` upgrades the
live database in place.

```sql
CREATE TABLE IF NOT EXISTS questions (
  id          BIGSERIAL    PRIMARY KEY,
  text        TEXT         NOT NULL,
  position    INTEGER      NOT NULL,
  retired_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS answers (
  id             BIGSERIAL    PRIMARY KEY,
  day            DATE         NOT NULL,
  question_id    BIGINT       NOT NULL REFERENCES questions (id),
  question_text  TEXT         NOT NULL,
  text           TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (day, question_id)
);

-- Starter questions, inserted only into an empty table.
INSERT INTO questions (text, position)
SELECT q.text, q.position
FROM (VALUES
  ('What made me anxious today, and what did I tell myself about it?', 1),
  ('What did I handle well today?', 2),
  ('What am I carrying into tomorrow?', 3)
) AS q (text, position)
WHERE NOT EXISTS (SELECT 1 FROM questions);
```

- "Active" questions are those with `retired_at IS NULL`, sorted by `position`.
- `question_id` has no `ON DELETE`: questions are never deleted, and the foreign
  key enforces that.
- `UNIQUE (day, question_id)` makes saving an upsert.

## Days and time zones

New `src/lib/days.ts`, the one place that knows what "a day" is:

- `TIME_ZONE`: `resolveTimeZone()` moves here from `message-list.tsx`, which
  now imports it.
- `today(): string` returns today's date in `TIME_ZONE` as `YYYY-MM-DD`.
- `parseDay(value): string | null` accepts a real calendar date in
  `YYYY-MM-DD` form (so it rejects `2026-02-30`) and returns `null` otherwise.
- Month helpers for the grid: first/last day of a month, previous/next month.

Days are passed around as `YYYY-MM-DD` strings, not `Date` objects, so a date
never gets shifted by the server's UTC clock.

## Queries

### `src/lib/messages.ts`
- `listMessagesForDay(day)`: messages where
  `(sent_at AT TIME ZONE tz)::date = day`, newest first. This replaces
  `listMessages(limit)` on the page.
- `listDaysWithMessages(from, to)`: the distinct local dates in a range that
  have messages. Used for the calendar dots.

### `src/lib/checkins.ts` (new)
- `listActiveQuestions()`, `listAllQuestions()` (for `/questions`, including
  retired ones).
- `listAnswersForDay(day)`: that day's answers, sorted by the question's
  position.
- `listDaysWithAnswers(from, to)`: used for the dots, admin only.
- `upsertAnswer(day, questionId, text)`: copies the question's current text into
  `question_text`. `deleteAnswer(day, questionId)`.
- `addQuestion(text)` (position = max + 1), `updateQuestionText(id, text)`,
  `moveQuestion(id, "up" | "down")` (swaps position with the neighbouring active
  question in one transaction), `retireQuestion(id)`.

## Server actions

All re-check `isAdmin()` first and throw `"unauthorized"`, like the existing
actions. Input is validated because server actions are public endpoints.

### `saveCheckinAction(day, answers: { questionId, text }[])`
1. `day` must equal `today()` computed on the server, otherwise return
   `{ ok: false, reason: "day-ended" }` (returned, not thrown, because Next.js
   hides thrown messages in production). This rejects crafted requests for past
   days, and catches a form left open past midnight. The form shows a "refresh"
   message in that case, keeping the drafts in place.
2. Each answer must have a positive integer `questionId`, no id may repeat, and
   each `text` is a string of at most 4096 characters, the same cap as thoughts.
   Otherwise throw `"invalid answers"`. If every answer is well formed but one
   names a question that isn't active (retired since the page loaded), return
   `{ ok: false, reason: "questions-changed" }` and write nothing.
3. For each answer: trimmed non-empty → `upsertAnswer`; empty → `deleteAnswer`.
   Answers for questions not included in the request are left untouched.
4. `revalidatePath("/")`.

### Question actions (`/questions`)
`addQuestionAction(text)`, `updateQuestionAction(id, text)`,
`moveQuestionAction(id, direction)`, `retireQuestionAction(id)`. Text is
trimmed, non-empty, and at most 500 characters. Each action calls
`revalidatePath` on `/questions` and `/`.

## Pages and components

### `/` (`src/app/page.tsx`)
- Reads `?day=YYYY-MM-DD`. A missing or invalid value means today. Future days
  are allowed and simply empty.
- **`MonthCalendar`** (server component): a Monday-first grid for the selected
  day's month. `‹ ›` links go to the same day number in the previous or next
  month, capped at that month's last day. Each day is a link to `/?day=…`. The
  selected day and today are highlighted, and a dot marks days with entries.
  Visitors see dots for thoughts only; when logged in, the dots include
  check-ins, so check-in days aren't revealed to visitors.
- **Day heading**, for example "Wednesday, 30 September".
- **Check-in section** (admin only):
  - For today: `CheckinForm` (client), one labelled textarea per active question,
    pre-filled with today's saved answers, and a Save button. ⌘/Ctrl+Enter
    saves. It shows "Saved" after a successful save and an error otherwise.
    Drafts are kept on failure, as in the compose dialog.
  - For other days: the stored answers, each under its saved `question_text`,
    read-only. If there are none, a "No check-in" note.
- **Thoughts section**: `MessageList` fed with `listMessagesForDay`. If the day
  has none, a short "No thoughts this day" notice. Deleting still works.
- The database-error notice stays.

### `/questions` (`src/app/questions/page.tsx`)
- Admin only. Visitors get a 404.
- Active questions in order, each with an editable text field and Save, ↑/↓, and
  Retire buttons. Below them, an "Add question" field.
- Retired questions are listed collapsed below, read-only.
- A "Questions" link in the header, shown only when logged in, next to "New
  entry".

## Testing

Vitest, following the existing `*.test.ts` pattern with the DB layer mocked.

- `days.test.ts`: `today()` near midnight across zones (for example 23:30 in
  Asia/Tokyo is still that date there), `parseDay` rejecting bad input and
  impossible dates, month boundaries including February and leap years.
- `actions.test.ts`: the check-in action rejects non-admins, rejects a
  non-today `day`, rejects unknown or retired question ids and oversized text,
  upserts non-empty answers and deletes blank ones. The question actions check
  auth and validation.
- Manual check: answer today's check-in, then reword a question the next day
  and confirm the previous day's answer still shows the old wording. Re-saving
  today copies the new wording in, by design.

## Before going live

Run `npm run db:init` against prod before deploying. It creates both tables and
the starter questions. Nothing touches `messages`, so the order matters less
than it did on Day 3, but the new page would fail to load without the tables.

## Out of scope

Reminders, backfilling missed days, restoring retired questions, pagination
beyond the month grid, and any LLM work (Day 5).
