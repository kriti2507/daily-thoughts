# Guided Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily check-in on the page (questions I choose, answered once a day) and a month calendar that shows each day's check-in next to that day's thoughts.

**Architecture:** Two new tables, `questions` and `answers`. Each answer stores a copy of its question's wording, so editing a question never rewrites the past. A new `src/lib/days.ts` owns "what is a day" (a `YYYY-MM-DD` date in `DISPLAY_TIME_ZONE`). The home page reads `?day=`, renders a server-side month grid plus that day's check-in (admin only) and thoughts. An admin-only `/questions` page manages the question set. All writes go through admin-gated server actions.

**Tech Stack:** Next.js 16 (App Router, server actions, async `searchParams`), React 19, Postgres via `postgres`, Tailwind v4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-guided-questions-design.md`

**Conventions:**
- Branch: `feat/guided-questions` (already created, on top of `feat/write-on-page`). Commit after each task; **never push**.
- `git commit` needs the sandbox disabled because of GPG signing.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The sandbox can't read `.env` and there's no local Postgres, so the SQL is only exercised when the user runs `npm run db:init` and `npm run dev` themselves. Type-check, lint, unit tests and `next build` are the automated gates.
- `substack.md` is local only: update it, never commit it.

**Deviations from the spec (deliberate):**
- The new actions go in `src/app/checkin-actions.ts` with their own test file, rather than growing `actions.ts`.
- `saveCheckinAction` *returns* `{ ok: false, reason: "day-ended" }` instead of throwing, because Next.js replaces thrown server-action messages with a generic error in production, so the client couldn't tell "day ended" apart from any other failure.
- The day heading uses US format ("Wednesday, September 30, 2026") to match the existing header date.
- Thought timestamps in the day view show only the time, since the heading already shows the date.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/lib/days.ts` | Create | `TIME_ZONE`, `today`, `parseDay`, month-grid helpers, day formatting |
| `src/lib/days.test.ts` | Create | Tests for the above |
| `src/components/message-list.tsx` | Modify | Import `TIME_ZONE`; show time only |
| `db/schema.sql` | Modify | `questions`, `answers`, starter questions |
| `src/lib/checkins.ts` | Create | Question and answer queries |
| `src/lib/messages.ts` | Modify | `listMessagesForDay`, `listDaysWithMessages`; drop `listMessages` |
| `src/app/checkin-actions.ts` | Create | `saveCheckinAction` + four question actions |
| `src/app/checkin-actions.test.ts` | Create | Tests for the above |
| `src/components/month-calendar.tsx` | Create | Month grid with dots and prev/next links |
| `src/components/checkin-form.tsx` | Create | Today's check-in form (client) |
| `src/components/checkin-answers.tsx` | Create | A past day's answers, read-only |
| `src/app/page.tsx` | Modify | Calendar + day view |
| `src/components/question-editor.tsx` | Create | Edit/move/retire row and add form (client) |
| `src/app/questions/page.tsx` | Create | Admin-only question management |
| `src/app/layout.tsx` | Modify | "Questions" header link, logo links home, header date in `TIME_ZONE` |
| `README.md` | Modify | Document check-ins, `/questions`, migration |

---

### Task 1: Days module

**Files:**
- Create: `src/lib/days.ts`
- Create: `src/lib/days.test.ts`
- Modify: `src/components/message-list.tsx`

- [ ] **Step 1: Write the failing tests** in `src/lib/days.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  dayInZone,
  formatDayHeading,
  formatMonthLabel,
  monthGrid,
  monthRange,
  parseDay,
  shiftMonth,
} from "@/lib/days";

describe("dayInZone", () => {
  it("uses the zone's date, not UTC's", () => {
    // 23:30 in Tokyo is still the 30th there.
    expect(dayInZone(new Date("2026-09-30T14:30:00Z"), "Asia/Tokyo")).toBe("2026-09-30");
    // 00:30 the next morning in Tokyo.
    expect(dayInZone(new Date("2026-09-30T15:30:00Z"), "Asia/Tokyo")).toBe("2026-10-01");
    // 20:00 in Los Angeles is still the 30th there, though UTC is on the 1st.
    expect(dayInZone(new Date("2026-10-01T03:00:00Z"), "America/Los_Angeles")).toBe(
      "2026-09-30",
    );
  });
});

describe("parseDay", () => {
  it("accepts real calendar dates", () => {
    expect(parseDay("2026-09-30")).toBe("2026-09-30");
    expect(parseDay("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects impossible dates and anything not YYYY-MM-DD", () => {
    for (const value of [
      "2026-02-29",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "2026-09-00",
      "2026-9-30",
      "2026-09-30T00:00",
      "",
      undefined,
      ["2026-09-30"],
      20260930,
    ]) {
      expect(parseDay(value)).toBeNull();
    }
  });
});

describe("monthRange", () => {
  it("spans the first to the last day of the month", () => {
    expect(monthRange("2026-02-14")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthRange("2028-02-03")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthRange("2026-12-31")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });
});

describe("shiftMonth", () => {
  it("keeps the day number when the target month has it", () => {
    expect(shiftMonth("2026-09-15", 1)).toBe("2026-10-15");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("clamps to the target month's last day", () => {
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("monthGrid", () => {
  it("lays the month out in Monday-first weeks padded with nulls", () => {
    // 1 September 2026 is a Tuesday; the 30th is a Wednesday.
    const weeks = monthGrid("2026-09-30");

    expect(weeks).toHaveLength(5);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
    expect(weeks[0]).toEqual([
      null,
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(weeks[4]).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", null, null, null, null]);
  });

  it("starts with no padding when the 1st is a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid("2026-06-10")[0][0]).toBe("2026-06-01");
  });
});

describe("formatting", () => {
  it("formats a day heading and a month label without shifting the date", () => {
    expect(formatDayHeading("2026-09-30")).toBe("Wednesday, September 30, 2026");
    expect(formatDayHeading("2026-01-01")).toBe("Thursday, January 1, 2026");
    expect(formatMonthLabel("2026-09-30")).toBe("September 2026");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/days.test.ts`
Expected: FAIL, because `@/lib/days` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/days.ts`**

```ts
import { optionalEnv } from "@/lib/env";

// A day is a calendar date in DISPLAY_TIME_ZONE, passed around as a
// "YYYY-MM-DD" string. Strings rather than Dates, so a day can never be shifted
// by reading it in the server's own zone (UTC on Vercel).

function resolveTimeZone(): string {
  const configured = optionalEnv("DISPLAY_TIME_ZONE", "UTC");
  try {
    new Date().toLocaleString("en-US", { timeZone: configured });
    return configured;
  } catch {
    console.error(
      `Invalid DISPLAY_TIME_ZONE ${JSON.stringify(configured)}; falling back to UTC`,
    );
    return "UTC";
  }
}

// Resolved once at module scope: the zone can't change between renders.
export const TIME_ZONE = resolveTimeZone();

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDay(year: number, month: number, date: number): string {
  return `${year}-${pad(month)}-${pad(date)}`;
}

// Only for days already known to be valid.
function splitDay(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
}

// `month` is 1-based, so day 0 of the next (0-based) month is this month's last.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtcDate(day: string): Date {
  const { year, month, date } = splitDay(day);
  return new Date(Date.UTC(year, month - 1, date));
}

export function dayInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function today(now: Date = new Date()): string {
  return dayInZone(now, TIME_ZONE);
}

export function parseDay(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = DAY_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, date] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || date < 1 || date > daysInMonth(year, month)) {
    return null;
  }
  return value;
}

export function monthRange(day: string): { first: string; last: string } {
  const { year, month } = splitDay(day);
  return { first: toDay(year, month, 1), last: toDay(year, month, daysInMonth(year, month)) };
}

// The same day number `delta` months away, clamped to that month's length.
export function shiftMonth(day: string, delta: number): string {
  const { year, month, date } = splitDay(day);
  const index = year * 12 + (month - 1) + delta;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return toDay(targetYear, targetMonth, Math.min(date, daysInMonth(targetYear, targetMonth)));
}

// Monday-first weeks of the day's month; cells outside the month are null.
export function monthGrid(day: string): (string | null)[][] {
  const { year, month } = splitDay(day);
  // getUTCDay() counts from Sunday = 0; shift so Monday = 0.
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let date = 1; date <= daysInMonth(year, month); date++) {
    cells.push(toDay(year, month, date));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function formatDayHeading(day: string): string {
  return toUtcDate(day).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMonthLabel(day: string): string {
  return toUtcDate(day).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}
```

- [ ] **Step 4: Point `message-list.tsx` at the shared zone, and show time only**

In `src/components/message-list.tsx`, replace everything from the imports through the end of `formatTimestamp` (lines 1–32) with:

```tsx
import { DeleteMessageButton } from "@/components/delete-message-button";
import { TIME_ZONE } from "@/lib/days";
import type { Message, MessageSource } from "@/lib/messages";

// The list now shows a single day under a date heading, so only the time is
// needed here.
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}
```

Leave `SOURCE_LABELS` and `MessageList` unchanged.

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run src/lib/days.test.ts && npx tsc --noEmit && npm test`
Expected: all tests PASS and there are no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/days.ts src/lib/days.test.ts src/components/message-list.tsx
git commit -m "feat: days module for dates in the display time zone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema and data layer

**Files:**
- Modify: `db/schema.sql`
- Create: `src/lib/checkins.ts`
- Modify: `src/lib/messages.ts`

The existing code has no DB-level tests, and there's no local Postgres, so this task is verified by type-check here and by the user's `db:init` run in Step 6.

- [ ] **Step 1: Append to `db/schema.sql`**

```sql

-- Daily check-in. Questions are retired, never deleted, and each answer keeps
-- a copy of the wording it was given, so editing a question never changes the
-- past.
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

- [ ] **Step 2: Create `src/lib/checkins.ts`**

```ts
import { getSql } from "@/lib/db";

export interface Question {
  id: number;
  text: string;
  position: number;
  retiredAt: Date | null;
}

export interface Answer {
  questionId: number;
  questionText: string;
  text: string;
}

type QuestionRow = { id: string; text: string; position: number; retired_at: Date | null };

function toQuestion(row: QuestionRow): Question {
  return {
    id: Number(row.id),
    text: row.text,
    position: row.position,
    retiredAt: row.retired_at,
  };
}

export async function listActiveQuestions(): Promise<Question[]> {
  const sql = getSql();
  const rows = await sql<QuestionRow[]>`
    SELECT id, text, position, retired_at
    FROM questions
    WHERE retired_at IS NULL
    ORDER BY position, id
  `;
  return rows.map(toQuestion);
}

// Active questions first, in order, then retired ones.
export async function listAllQuestions(): Promise<Question[]> {
  const sql = getSql();
  const rows = await sql<QuestionRow[]>`
    SELECT id, text, position, retired_at
    FROM questions
    ORDER BY retired_at IS NOT NULL, position, id
  `;
  return rows.map(toQuestion);
}

export async function listAnswersForDay(day: string): Promise<Answer[]> {
  const sql = getSql();
  const rows = await sql<{ question_id: string; question_text: string; text: string }[]>`
    SELECT a.question_id, a.question_text, a.text
    FROM answers a
    JOIN questions q ON q.id = a.question_id
    WHERE a.day = ${day}::date
    ORDER BY q.position, q.id
  `;
  return rows.map((row) => ({
    questionId: Number(row.question_id),
    questionText: row.question_text,
    text: row.text,
  }));
}

// `to_char` so the driver hands back "YYYY-MM-DD" strings rather than Dates.
export async function listDaysWithAnswers(from: string, to: string): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<{ day: string }[]>`
    SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day
    FROM answers
    WHERE day BETWEEN ${from}::date AND ${to}::date
  `;
  return rows.map((row) => row.day);
}

// Copies the question's current wording in on every save, so an answer always
// shows the question as it read when last answered.
export async function upsertAnswer(day: string, questionId: number, text: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO answers (day, question_id, question_text, text)
    SELECT ${day}::date, q.id, q.text, ${text}
    FROM questions q
    WHERE q.id = ${questionId}
    ON CONFLICT (day, question_id) DO UPDATE
      SET question_text = EXCLUDED.question_text,
          text = EXCLUDED.text,
          updated_at = now()
  `;
}

export async function deleteAnswer(day: string, questionId: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM answers WHERE day = ${day}::date AND question_id = ${questionId}`;
}

export async function addQuestion(text: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO questions (text, position)
    SELECT ${text}, COALESCE(MAX(position), 0) + 1 FROM questions
  `;
}

export async function updateQuestionText(id: number, text: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE questions SET text = ${text} WHERE id = ${id} AND retired_at IS NULL`;
}

export async function retireQuestion(id: number): Promise<void> {
  const sql = getSql();
  await sql`UPDATE questions SET retired_at = now() WHERE id = ${id} AND retired_at IS NULL`;
}

// Swaps positions with the nearest active question above or below, in one
// statement so the swap is atomic. A no-op at either end of the list.
export async function moveQuestion(id: number, direction: "up" | "down"): Promise<void> {
  const sql = getSql();
  const neighbour =
    direction === "up"
      ? sql`q.position < c.position ORDER BY q.position DESC`
      : sql`q.position > c.position ORDER BY q.position ASC`;
  await sql`
    WITH c AS (
      SELECT id, position FROM questions WHERE id = ${id} AND retired_at IS NULL
    ), n AS (
      SELECT q.id, q.position
      FROM questions q, c
      WHERE q.retired_at IS NULL AND ${neighbour}
      LIMIT 1
    )
    UPDATE questions q
    SET position = CASE WHEN q.id = c.id THEN n.position ELSE c.position END
    FROM c, n
    WHERE q.id IN (c.id, n.id)
  `;
}
```

- [ ] **Step 3: Replace `listMessages` in `src/lib/messages.ts`**

Add this import at the top, under the `getSql` import:

```ts
import { TIME_ZONE } from "@/lib/days";
```

Then replace the whole `listMessages` function (from `export async function listMessages` to the end of the file) with:

```ts
type MessageRow = { id: string; text: string; sent_at: Date; source: MessageSource };

function toMessage(row: MessageRow): Message {
  return {
    id: Number(row.id),
    text: row.text,
    sentAt: row.sent_at,
    source: row.source,
  };
}

// A message belongs to the day it was sent on in the display time zone.
export async function listMessagesForDay(day: string): Promise<Message[]> {
  const sql = getSql();
  const rows = await sql<MessageRow[]>`
    SELECT id, text, sent_at, source
    FROM messages
    WHERE (sent_at AT TIME ZONE ${TIME_ZONE})::date = ${day}::date
    ORDER BY sent_at DESC, id DESC
  `;
  return rows.map(toMessage);
}

// `to_char` so the driver hands back "YYYY-MM-DD" strings rather than Dates.
export async function listDaysWithMessages(from: string, to: string): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<{ day: string }[]>`
    SELECT DISTINCT to_char((sent_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM-DD') AS day
    FROM messages
    WHERE (sent_at AT TIME ZONE ${TIME_ZONE})::date BETWEEN ${from}::date AND ${to}::date
  `;
  return rows.map((row) => row.day);
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: the only errors are in `src/app/page.tsx`, which still imports `listMessages`. Task 4 rewrites that file. There should be no errors in `src/lib/`.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql src/lib/checkins.ts src/lib/messages.ts
git commit -m "feat: questions and answers tables, per-day queries

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The commit leaves `page.tsx` broken on its own. Task 4 fixes it. That's acceptable here because nothing is deployed from this branch mid-plan.)

- [ ] **Step 6: Ask the user to apply the schema**

Ask the user to run `! npm run db:init` against their local/dev database.
Expected output: `schema applied`. Running it a second time must also print `schema applied` and must not add a second set of starter questions.

---

### Task 3: Server actions

**Files:**
- Create: `src/app/checkin-actions.ts`
- Create: `src/app/checkin-actions.test.ts`

- [ ] **Step 1: Write the failing tests** in `src/app/checkin-actions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/checkins", () => ({
  addQuestion: vi.fn(),
  deleteAnswer: vi.fn(),
  listActiveQuestions: vi.fn(),
  moveQuestion: vi.fn(),
  retireQuestion: vi.fn(),
  updateQuestionText: vi.fn(),
  upsertAnswer: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/days", () => ({
  today: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import {
  addQuestionAction,
  moveQuestionAction,
  retireQuestionAction,
  saveCheckinAction,
  updateQuestionAction,
} from "@/app/checkin-actions";
import { isAdmin } from "@/lib/admin";
import {
  addQuestion,
  deleteAnswer,
  listActiveQuestions,
  moveQuestion,
  retireQuestion,
  updateQuestionText,
  upsertAnswer,
} from "@/lib/checkins";
import { today } from "@/lib/days";

const TODAY = "2026-09-30";

beforeEach(() => {
  vi.mocked(today).mockReturnValue(TODAY);
  vi.mocked(listActiveQuestions).mockResolvedValue([
    { id: 1, text: "First?", position: 1, retiredAt: null },
    { id: 2, text: "Second?", position: 2, retiredAt: null },
  ]);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("saveCheckinAction", () => {
  it("saves non-blank answers trimmed, deletes blank ones, and refreshes the page", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const result = await saveCheckinAction(TODAY, [
      { questionId: 1, text: "  felt fine\n" },
      { questionId: 2, text: "   " },
    ]);

    expect(result).toEqual({ ok: true });
    expect(upsertAnswer).toHaveBeenCalledWith(TODAY, 1, "felt fine");
    expect(deleteAnswer).toHaveBeenCalledWith(TODAY, 2);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(saveCheckinAction(TODAY, [{ questionId: 1, text: "x" }])).rejects.toThrow(
      "unauthorized",
    );
    expect(upsertAnswer).not.toHaveBeenCalled();
  });

  it("reports a day that is no longer today without writing anything", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const result = await saveCheckinAction("2026-09-29", [{ questionId: 1, text: "x" }]);

    expect(result).toEqual({ ok: false, reason: "day-ended" });
    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
  });

  it("writes nothing if any answer is invalid", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const invalid = [
      { questionId: 3, text: "unknown or retired question" },
      { questionId: 0, text: "x" },
      { questionId: 1.5, text: "x" },
      { questionId: "1" as unknown as number, text: "x" },
      { questionId: 1, text: 7 as unknown as string },
      { questionId: 1, text: "x".repeat(4097) },
      null as unknown as { questionId: number; text: string },
    ];
    for (const answer of invalid) {
      await expect(
        saveCheckinAction(TODAY, [{ questionId: 2, text: "valid" }, answer]),
      ).rejects.toThrow("invalid answers");
    }
    await expect(
      saveCheckinAction(TODAY, "nope" as unknown as { questionId: number; text: string }[]),
    ).rejects.toThrow("invalid answers");

    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
  });

  it("accepts an answer at exactly the length limit", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await saveCheckinAction(TODAY, [{ questionId: 1, text: "x".repeat(4096) }]);

    expect(upsertAnswer).toHaveBeenCalledWith(TODAY, 1, "x".repeat(4096));
  });
});

describe("question actions", () => {
  it("each refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(addQuestionAction("Q?")).rejects.toThrow("unauthorized");
    await expect(updateQuestionAction(1, "Q?")).rejects.toThrow("unauthorized");
    await expect(moveQuestionAction(1, "up")).rejects.toThrow("unauthorized");
    await expect(retireQuestionAction(1)).rejects.toThrow("unauthorized");
    expect(addQuestion).not.toHaveBeenCalled();
    expect(updateQuestionText).not.toHaveBeenCalled();
    expect(moveQuestion).not.toHaveBeenCalled();
    expect(retireQuestion).not.toHaveBeenCalled();
  });

  it("adds a trimmed question and refreshes both pages", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await addQuestionAction("  What surprised me?\n");

    expect(addQuestion).toHaveBeenCalledWith("What surprised me?");
    expect(revalidatePath).toHaveBeenCalledWith("/questions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses question text that is blank, too long, or not a string", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const text of ["", "  \n", "x".repeat(501), 7 as unknown as string]) {
      await expect(addQuestionAction(text)).rejects.toThrow("invalid question");
      await expect(updateQuestionAction(1, text)).rejects.toThrow("invalid question");
    }
    expect(addQuestion).not.toHaveBeenCalled();
    expect(updateQuestionText).not.toHaveBeenCalled();
  });

  it("rewords, moves, and retires by id", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await updateQuestionAction(2, " Reworded? ");
    await moveQuestionAction(2, "down");
    await retireQuestionAction(2);

    expect(updateQuestionText).toHaveBeenCalledWith(2, "Reworded?");
    expect(moveQuestion).toHaveBeenCalledWith(2, "down");
    expect(retireQuestion).toHaveBeenCalledWith(2);
  });

  it("refuses ids that are not positive integers and unknown directions", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const id of [0, -1, 1.5, Number.NaN, "2" as unknown as number]) {
      await expect(updateQuestionAction(id, "Q?")).rejects.toThrow("invalid question id");
      await expect(moveQuestionAction(id, "up")).rejects.toThrow("invalid question id");
      await expect(retireQuestionAction(id)).rejects.toThrow("invalid question id");
    }
    await expect(moveQuestionAction(1, "sideways" as "up")).rejects.toThrow("invalid direction");
    expect(updateQuestionText).not.toHaveBeenCalled();
    expect(moveQuestion).not.toHaveBeenCalled();
    expect(retireQuestion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/checkin-actions.test.ts`
Expected: FAIL, because `@/app/checkin-actions` doesn't exist yet.

- [ ] **Step 3: Create `src/app/checkin-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import {
  addQuestion,
  deleteAnswer,
  listActiveQuestions,
  moveQuestion,
  retireQuestion,
  updateQuestionText,
  upsertAnswer,
} from "@/lib/checkins";
import { today } from "@/lib/days";

// Same cap as a thought, so nothing written here is bigger than an entry.
const MAX_ANSWER_LENGTH = 4096;
const MAX_QUESTION_LENGTH = 500;

export interface AnswerInput {
  questionId: number;
  text: string;
}

// Returned rather than thrown: Next.js hides thrown messages from the client in
// production, and the form needs to tell "the day ended" apart from a failure.
export type SaveCheckinResult = { ok: true } | { ok: false; reason: "day-ended" };

// Server actions are public endpoints: anyone can call them with any argument,
// whether or not the page rendered a form for them. Hence every check below.
async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requireId(value: unknown): number {
  if (!isId(value)) {
    throw new Error("invalid question id");
  }
  return value;
}

function cleanQuestionText(text: unknown): string {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_LENGTH) {
    throw new Error("invalid question");
  }
  return trimmed;
}

function refreshQuestions(): void {
  revalidatePath("/questions");
  revalidatePath("/");
}

// Only today can be written. The day is checked against the server's clock, so
// a crafted request can't write to the past and a form left open past midnight
// can't save into the wrong day.
export async function saveCheckinAction(
  day: string,
  answers: AnswerInput[],
): Promise<SaveCheckinResult> {
  await requireAdmin();
  if (day !== today()) {
    return { ok: false, reason: "day-ended" };
  }
  if (!Array.isArray(answers)) {
    throw new Error("invalid answers");
  }

  const activeIds = new Set((await listActiveQuestions()).map((question) => question.id));
  // Validate everything before writing anything, so a bad answer can't leave
  // a half-saved check-in.
  for (const answer of answers) {
    if (
      typeof answer !== "object" ||
      answer === null ||
      !isId(answer.questionId) ||
      !activeIds.has(answer.questionId) ||
      typeof answer.text !== "string" ||
      answer.text.trim().length > MAX_ANSWER_LENGTH
    ) {
      throw new Error("invalid answers");
    }
  }

  for (const { questionId, text } of answers) {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      await upsertAnswer(day, questionId, trimmed);
    } else {
      await deleteAnswer(day, questionId);
    }
  }
  revalidatePath("/");
  return { ok: true };
}

export async function addQuestionAction(text: string): Promise<void> {
  await requireAdmin();
  await addQuestion(cleanQuestionText(text));
  refreshQuestions();
}

export async function updateQuestionAction(id: number, text: string): Promise<void> {
  await requireAdmin();
  await updateQuestionText(requireId(id), cleanQuestionText(text));
  refreshQuestions();
}

export async function moveQuestionAction(id: number, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const questionId = requireId(id);
  if (direction !== "up" && direction !== "down") {
    throw new Error("invalid direction");
  }
  await moveQuestion(questionId, direction);
  refreshQuestions();
}

export async function retireQuestionAction(id: number): Promise<void> {
  await requireAdmin();
  await retireQuestion(requireId(id));
  refreshQuestions();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/checkin-actions.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/checkin-actions.ts src/app/checkin-actions.test.ts
git commit -m "feat: admin-only actions to save a check-in and manage questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Calendar and day view

**Files:**
- Create: `src/components/month-calendar.tsx`
- Create: `src/components/checkin-form.tsx`
- Create: `src/components/checkin-answers.tsx`
- Modify: `src/app/page.tsx` (full rewrite)

- [ ] **Step 1: Create `src/components/month-calendar.tsx`**

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatDayHeading, formatMonthLabel, monthGrid, shiftMonth } from "@/lib/days";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NAV_LINK =
  "flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--border)] hover:text-foreground";

// Links rather than client state: each day is its own URL, so the back button
// and bookmarks work. prefetch is off because every link is a dynamic page
// that hits the database.
export function MonthCalendar({
  selectedDay,
  today,
  markedDays,
}: {
  selectedDay: string;
  today: string;
  markedDays: string[];
}) {
  const marked = new Set(markedDays);

  return (
    <nav
      aria-label="Calendar"
      className="rounded-xl border border-[var(--border)] bg-card px-5 py-4"
    >
      <div className="flex items-center justify-between">
        <Link href={`/?day=${shiftMonth(selectedDay, -1)}`} prefetch={false} className={NAV_LINK}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous month</span>
        </Link>
        <p className="font-heading text-[15px] font-bold">{formatMonthLabel(selectedDay)}</p>
        <Link href={`/?day=${shiftMonth(selectedDay, 1)}`} prefetch={false} className={NAV_LINK}>
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next month</span>
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            aria-hidden
            className="text-[11px] font-medium text-[var(--text-muted)]"
          >
            {weekday}
          </span>
        ))}
        {monthGrid(selectedDay)
          .flat()
          .map((day, index) =>
            day === null ? (
              <span key={`empty-${index}`} />
            ) : (
              <Link
                key={day}
                href={`/?day=${day}`}
                prefetch={false}
                aria-current={day === selectedDay ? "date" : undefined}
                aria-label={`${formatDayHeading(day)}${marked.has(day) ? ", has entries" : ""}`}
                className={cn(
                  "flex h-9 flex-col items-center justify-center rounded-md text-[13px] transition-colors duration-200 hover:bg-[var(--border)]",
                  day === today && "font-bold text-[var(--accent-terracotta)]",
                  day === selectedDay &&
                    "bg-foreground text-[var(--background)] hover:bg-foreground",
                )}
              >
                {Number(day.slice(8))}
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-1 rounded-full bg-[var(--accent-amber)]",
                    !marked.has(day) && "invisible",
                  )}
                />
              </Link>
            ),
          )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create `src/components/checkin-form.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { saveCheckinAction } from "@/app/checkin-actions";

type Status = "idle" | "saved" | "day-ended" | "error";

const STATUS_TEXT: Record<Status, string> = {
  idle: "⌘/Ctrl + Enter to save",
  saved: "Saved",
  "day-ended": "This day has ended. Your drafts are still here. Copy them, then refresh.",
  error: "Couldn't save the check-in.",
};

export function CheckinForm({
  day,
  questions,
  initialAnswers,
}: {
  day: string;
  questions: { id: number; text: string }[];
  initialAnswers: Record<number, string>;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, initialAnswers[q.id] ?? ""])),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [isPending, startTransition] = useTransition();

  if (questions.length === 0) {
    return (
      <p className="text-[15px] text-[var(--text-secondary)]">
        No questions yet.{" "}
        <Link href="/questions" className="underline underline-offset-2">
          Add some
        </Link>
        .
      </p>
    );
  }

  function update(id: number, value: string) {
    setDrafts((current) => ({ ...current, [id]: value }));
    setStatus("idle");
  }

  function save() {
    if (isPending) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveCheckinAction(
          day,
          questions.map((q) => ({ questionId: q.id, text: drafts[q.id] ?? "" })),
        );
        setStatus(result.ok ? "saved" : "day-ended");
      } catch (error) {
        // Keep the drafts: nothing typed should be lost to a failed save.
        console.error("failed to save check-in", error);
        setStatus("error");
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-card px-5 py-4"
    >
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <label htmlFor={`question-${q.id}`} className="text-[15px] font-medium">
            {q.text}
          </label>
          <textarea
            id={`question-${q.id}`}
            value={drafts[q.id] ?? ""}
            onChange={(event) => update(q.id, event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            readOnly={isPending}
            maxLength={4096}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[var(--border-strong)]"
          />
        </div>
      ))}
      <div className="flex items-center justify-end gap-2">
        <span role="status" className="mr-auto text-[12px] text-[var(--text-muted)]">
          {STATUS_TEXT[status]}
        </span>
        <button
          type="submit"
          disabled={isPending}
          className="h-8 cursor-pointer rounded-md bg-foreground px-3 text-[13px] font-semibold text-[var(--background)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `src/components/checkin-answers.tsx`**

```tsx
import type { Answer } from "@/lib/checkins";

// Shows the question as it was worded when answered, not its current wording.
export function CheckinAnswers({ answers }: { answers: Answer[] }) {
  if (answers.length === 0) {
    return <p className="text-[15px] text-[var(--text-secondary)]">No check-in this day.</p>;
  }
  return (
    <dl className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-card px-5 py-4">
      {answers.map((answer) => (
        <div key={answer.questionId}>
          <dt className="text-[13px] font-medium text-[var(--text-muted)]">
            {answer.questionText}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{answer.text}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx` with:**

```tsx
import type { ReactNode } from "react";

import { CheckinAnswers } from "@/components/checkin-answers";
import { CheckinForm } from "@/components/checkin-form";
import { MessageList } from "@/components/message-list";
import { MonthCalendar } from "@/components/month-calendar";
import { isAdmin } from "@/lib/admin";
import { listActiveQuestions, listAnswersForDay, listDaysWithAnswers } from "@/lib/checkins";
import type { Answer, Question } from "@/lib/checkins";
import { formatDayHeading, monthRange, parseDay, today } from "@/lib/days";
import { listDaysWithMessages, listMessagesForDay } from "@/lib/messages";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] text-[var(--text-secondary)]">{children}</p>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

// Check-ins are private: visitors get neither the answers nor the dots that
// would reveal which days had one.
async function loadDay(day: string, isOwner: boolean) {
  const { first, last } = monthRange(day);
  const [messages, messageDays, answerDays, answers, questions] = await Promise.all([
    listMessagesForDay(day),
    listDaysWithMessages(first, last),
    isOwner ? listDaysWithAnswers(first, last) : ([] as string[]),
    isOwner ? listAnswersForDay(day) : ([] as Answer[]),
    isOwner ? listActiveQuestions() : ([] as Question[]),
  ]);
  return { messages, markedDays: [...messageDays, ...answerDays], answers, questions };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const todayDay = today();
  // A missing or malformed ?day= just means today.
  const day = parseDay((await searchParams).day) ?? todayDay;
  const isOwner = await isAdmin();

  let data: Awaited<ReturnType<typeof loadDay>> | null = null;
  try {
    data = await loadDay(day, isOwner);
  } catch (error) {
    console.error("failed to load day", error);
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-6 py-10">
      {data === null ? (
        <Notice>
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </Notice>
      ) : (
        <>
          <MonthCalendar selectedDay={day} today={todayDay} markedDays={data.markedDays} />

          <section aria-labelledby="day-heading" className="flex flex-col gap-6">
            <h1 id="day-heading" className="font-heading text-2xl font-bold">
              {formatDayHeading(day)}
            </h1>

            {isOwner && (
              <div className="flex flex-col gap-3">
                <SectionTitle>Check-in</SectionTitle>
                {day === todayDay ? (
                  <CheckinForm
                    key={day}
                    day={day}
                    questions={data.questions.map(({ id, text }) => ({ id, text }))}
                    initialAnswers={Object.fromEntries(
                      data.answers.map((answer) => [answer.questionId, answer.text]),
                    )}
                  />
                ) : (
                  <CheckinAnswers answers={data.answers} />
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <SectionTitle>Thoughts</SectionTitle>
              {data.messages.length === 0 ? (
                <Notice>No thoughts this day.</Notice>
              ) : (
                <MessageList messages={data.messages} canDelete={isOwner} />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Type-check, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors and no lint errors, and all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/month-calendar.tsx src/components/checkin-form.tsx src/components/checkin-answers.tsx src/app/page.tsx
git commit -m "feat: month calendar with each day's check-in and thoughts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Questions page and header

**Files:**
- Create: `src/components/question-editor.tsx`
- Create: `src/app/questions/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `src/components/question-editor.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { Archive, ArrowDown, ArrowUp } from "lucide-react";

import {
  addQuestionAction,
  moveQuestionAction,
  retireQuestionAction,
  updateQuestionAction,
} from "@/app/checkin-actions";

const INPUT =
  "min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[15px] outline-none focus:border-[var(--border-strong)]";
const PRIMARY_BUTTON =
  "h-8 cursor-pointer rounded-md bg-foreground px-3 text-[13px] font-semibold text-[var(--background)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40";

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--border)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function useAction() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<void>, failure: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (error) {
        console.error(failure, error);
        window.alert(failure);
      }
    });
  }
  return { isPending, run };
}

export function QuestionEditor({
  id,
  text,
  isFirst,
  isLast,
}: {
  id: number;
  text: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [draft, setDraft] = useState(text);
  const { isPending, run } = useAction();
  const trimmed = draft.trim();
  const isDirty = trimmed !== text;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDirty && trimmed.length > 0 && !isPending) {
      run(() => updateQuestionAction(id, draft), "Couldn't save the question.");
    }
  }

  function retire() {
    if (!window.confirm("Retire this question? Past answers keep it, but it won't be asked again.")) {
      return;
    }
    run(() => retireQuestionAction(id), "Couldn't retire the question.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-card px-3 py-2"
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Question"
        maxLength={500}
        readOnly={isPending}
        className={INPUT}
      />
      {isDirty && (
        <button type="submit" disabled={isPending || trimmed.length === 0} className={PRIMARY_BUTTON}>
          Save
        </button>
      )}
      <IconButton
        label="Move up"
        disabled={isFirst || isPending}
        onClick={() => run(() => moveQuestionAction(id, "up"), "Couldn't move the question.")}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label="Move down"
        disabled={isLast || isPending}
        onClick={() => run(() => moveQuestionAction(id, "down"), "Couldn't move the question.")}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Retire question" disabled={isPending} onClick={retire}>
        <Archive className="h-3.5 w-3.5" />
      </IconButton>
    </form>
  );
}

export function AddQuestionForm() {
  const [draft, setDraft] = useState("");
  const { isPending, run } = useAction();
  const canAdd = draft.trim().length > 0 && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canAdd) {
      run(() => addQuestionAction(draft), "Couldn't add the question.", () => setDraft(""));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add a question"
        aria-label="New question"
        maxLength={500}
        readOnly={isPending}
        className={INPUT}
      />
      <button type="submit" disabled={!canAdd} className={PRIMARY_BUTTON}>
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `src/app/questions/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddQuestionForm, QuestionEditor } from "@/components/question-editor";
import { isAdmin } from "@/lib/admin";
import { listAllQuestions } from "@/lib/checkins";
import type { Question } from "@/lib/checkins";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  // A 404 rather than a login prompt: to visitors this page doesn't exist.
  if (!(await isAdmin())) {
    notFound();
  }

  let questions: Question[] | null = null;
  try {
    questions = await listAllQuestions();
  } catch (error) {
    console.error("failed to load questions", error);
  }

  if (questions === null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <p className="text-[15px] text-[var(--text-secondary)]">
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </p>
      </div>
    );
  }

  const active = questions.filter((q) => q.retiredAt === null);
  const retired = questions.filter((q) => q.retiredAt !== null);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-[13px] text-[var(--text-secondary)] hover:text-foreground">
          ← Back to today
        </Link>
        <h1 className="font-heading text-2xl font-bold">Questions</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          Your daily check-in asks these, in this order. Rewording a question only
          changes future check-ins. Past answers keep the wording they were given.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {active.map((q, index) => (
          <li key={q.id}>
            <QuestionEditor
              id={q.id}
              text={q.text}
              isFirst={index === 0}
              isLast={index === active.length - 1}
            />
          </li>
        ))}
      </ol>

      <AddQuestionForm />

      {retired.length > 0 && (
        <details className="text-[15px] text-[var(--text-secondary)]">
          <summary className="cursor-pointer">Retired ({retired.length})</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {retired.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `src/app/layout.tsx`**

Replace the lucide import line:

```tsx
import { MessageCircle } from "lucide-react";
```

with:

```tsx
import Link from "next/link";
import { ListChecks, MessageCircle } from "lucide-react";
import { TIME_ZONE } from "@/lib/days";
```

In `HeaderDate`, add `timeZone: TIME_ZONE,` as the first option passed to `toLocaleDateString`, so the header shows the same "today" as the calendar:

```tsx
  const formatted = now.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
```

Make the logo block link home. Change its wrapper from `<div className="flex items-center gap-3">` … `</div>` to:

```tsx
            <Link href="/" className="flex items-center gap-3">
              {/* the existing icon div and "Daily Thoughts" span, unchanged */}
            </Link>
```

Replace `{canWrite && <ComposeDialog />}` with:

```tsx
              {canWrite && (
                <Link
                  href="/questions"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--card)] transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]"
                >
                  <ListChecks className="h-4 w-4 text-[var(--accent-amber)]" />
                  <span className="sr-only">Questions</span>
                </Link>
              )}
              {canWrite && <ComposeDialog />}
```

- [ ] **Step 4: Type-check, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all four pass. `next build` doesn't query the database here (both pages are `force-dynamic`). If the build fails only because `DATABASE_URL` or another env var is missing, report that to the user rather than working around it.

- [ ] **Step 5: Commit**

```bash
git add src/components/question-editor.tsx src/app/questions/page.tsx src/app/layout.tsx
git commit -m "feat: admin page to add, reword, reorder and retire questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs and manual check

**Files:**
- Modify: `README.md`
- Modify (local only, never commit): `substack.md`

- [ ] **Step 1: Add a section to `README.md`**, directly after the "Writing and deleting from the page" section:

```markdown
## Daily check-in

The page is a month calendar. Click a day to see that day's thoughts and, when
you're logged in as admin, that day's check-in. Today's check-in is a form with
one box per question. You can come back and edit it until midnight in
`DISPLAY_TIME_ZONE`, after which it's read-only. Blank answers are skipped.

Manage the questions at `/questions` (the checklist icon in the header). You
can add, reword, reorder and retire them. Each answer keeps a copy of the
wording it was given, so rewording or retiring a question never changes past
days. Check-ins are private: visitors see the calendar and thoughts, but not
your answers or which days had a check-in.
```

- [ ] **Step 2: Update the configuration table row** for `DISPLAY_TIME_ZONE` in `README.md` to:

```markdown
| `DISPLAY_TIME_ZONE` | no | IANA zone for timestamps, and for where one day ends and the next begins. Defaults to `UTC`; an invalid zone falls back to `UTC` with a logged warning. |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: daily check-in and question management

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Manual check with the user.** Ask them to run `! npm run dev`, visit `/admin?key=…`, and confirm each of these:
  1. Today is highlighted, and the check-in shows the three starter questions.
  2. Answer two questions, leave one blank, and click Save. You see "Saved", and today gets a dot.
  3. Click another day, then return to today. The answers are still there.
  4. On `/questions`, reword a question you answered today, then go back to `/` and save again. The answer is now stored under the new wording. Past days would keep the old wording.
  5. Move a question down and retire one. The order and set of questions change on `/`.
  6. In a private window (not logged in), `/` shows the calendar and thoughts but no check-in section, and `/questions` returns a 404.
  7. `/?day=2026-02-30` and `/?day=garbage` fall back to today.

- [ ] **Step 5: Update `substack.md`** (local only, never commit). Change the Day 4 heading to `### Day 4: Guided questions ✅ built (not yet deployed or posted)`. Rewrite its **Build** and **Done when** entries to match the spec: web-only check-in, questions I edit myself, and a calendar view instead of the bot sending the question. Add a short **Shipped:** note and a **Before going live:** note saying to run `npm run db:init` against prod before deploying.
