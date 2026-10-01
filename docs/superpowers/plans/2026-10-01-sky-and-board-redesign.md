# Sky & Board Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the app into a bold "sky and board": thoughts as bobbing clouds, check-ins as post-its you write on and drag, a calm/loud theme switch, a tear-off calendar (desktop) and timeline dock (phone), a day sticker, a "checked in" stamp, mind weather, a cloud-shaped composer, and keyboard/swipe day flipping.

**Architecture:** Theme tokens in `globals.css` keyed on `data-mode` (set by `next-themes`); every component reads tokens only. Pure helpers (`lib/weather`, `lib/clouds`, `lib/board`, `lib/day-keys`, `lib/sticker-list`, `shiftDay`/`dayParts`) are unit-tested. Client components talk through three window events in `lib/ui-events.ts` (flip day, open composer, check-in saved), so there is no shared provider. Two small schema additions (note positions, day stickers) with two new admin-only server actions.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19.2 (`useEffectEvent`), Tailwind CSS v4, `next-themes`, `postgres` (postgres.js), Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-01-sky-and-board-redesign-design.md`

**Conventions for every task:**
- Work on branch `feat/sky-and-board` (already created).
- Commit signing is off in this repo, so `git commit` works inside the sandbox. Never push.
- Each commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` after a blank line.
- `npm test` runs Vitest (node environment, `src/**/*.test.ts`). `npx tsc --noEmit` type-checks. `npm run lint` runs ESLint.

**One deliberate refinement of the spec:** on desktop, post-its are a fixed size (13rem × 12rem) with internal scrolling, because freely positioned notes need a known size; on phones they grow with their text. `getDaySticker` is not built — the page reads the day's sticker from the month's `listDayStickers` result.

---

## File map

**Create**
- `src/lib/weather.ts` (+ test) — `mindWeather(count)`.
- `src/lib/clouds.ts` (+ test) — `cloudSize`, `seeded`, `cloudJitter`.
- `src/lib/board.ts` (+ test) — `clamp01`, `noteColor`, `boardRows`, `defaultNotePosition`.
- `src/lib/day-keys.ts` (+ test) — `keyToAction`, `swipeToDelta`.
- `src/lib/sticker-list.ts` (+ test) — `STICKERS`, `STICKER_NAMES`, `isSticker` (no DB, safe on the client).
- `src/lib/stickers.ts` — DB access for `day_stickers`.
- `src/lib/ui-events.ts` — window events + reduced-motion helpers (client only).
- `src/components/mode-switch.tsx` — calm/loud pill.
- `src/components/cloud-shape.tsx` — the decorative cloud outline.
- `src/components/thought-cloud.tsx` — one thought (bob, puff-delete).
- `src/components/sky.tsx` — the thoughts band.
- `src/components/month-popover.tsx` — month grid in a dialog.
- `src/components/tear-off-calendar.tsx` — desktop calendar + flip owner.
- `src/components/timeline-dock.tsx` — phone dock.
- `src/components/post-it.tsx` — one note (presentational).
- `src/components/board.tsx` — check-in board (write, save, slap, drag).
- `src/components/day-sticker-picker.tsx` — today's sticker row.
- `src/components/day-navigation.tsx` — keys + swipe.

**Modify**
- `db/schema.sql`, `src/lib/checkins.ts`, `src/lib/days.ts` (+ test), `src/app/checkin-actions.ts` (+ test)
- `src/app/globals.css`, `src/app/layout.tsx`, `src/components/theme-provider.tsx`
- `src/components/month-calendar.tsx`, `src/components/compose-dialog.tsx`, `src/components/question-editor.tsx`
- `src/app/page.tsx`, `src/app/questions/page.tsx`, `README.md`

**Delete**
- `src/components/theme-toggle.tsx`, `message-list.tsx`, `delete-message-button.tsx`, `checkin-form.tsx`, `checkin-answers.tsx`

---

### Task 1: `shiftDay` and `dayParts`

**Files:**
- Modify: `src/lib/days.ts` (append after `formatMonthLabel`)
- Test: `src/lib/days.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/days.test.ts`, extend the import list:

```ts
import {
  dayInZone,
  dayParts,
  formatDayHeading,
  formatMonthLabel,
  monthGrid,
  monthRange,
  parseDay,
  resolveTimeZone,
  shiftDay,
  shiftMonth,
} from "@/lib/days";
```

Append at the end of the file:

```ts
describe("shiftDay", () => {
  it("moves within a month", () => {
    expect(shiftDay("2026-10-01", 1)).toBe("2026-10-02");
    expect(shiftDay("2026-10-15", -3)).toBe("2026-10-12");
  });

  it("crosses month and year ends in both directions", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("knows leap years", () => {
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDay("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("dayParts", () => {
  it("returns what a page-a-day calendar shows", () => {
    expect(dayParts("2026-10-01")).toEqual({ month: "October", date: 1, weekday: "Thursday" });
    expect(dayParts("2027-01-31")).toEqual({ month: "January", date: 31, weekday: "Sunday" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/days.test.ts`
Expected: FAIL — `shiftDay` / `dayParts` is not a function.

- [ ] **Step 3: Implement**

Append to `src/lib/days.ts`:

```ts
// The day `delta` days away, across month and year ends.
export function shiftDay(day: string, delta: number): string {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// What a page-a-day calendar prints: month name, day number, weekday.
export function dayParts(day: string): { month: string; date: number; weekday: string } {
  const date = toUtcDate(day);
  return {
    month: date.toLocaleDateString("en-US", { timeZone: "UTC", month: "long" }),
    date: date.getUTCDate(),
    weekday: date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" }),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/days.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/days.ts src/lib/days.test.ts
git commit -m "feat: shiftDay and dayParts helpers"
```

---

### Task 2: Mind weather

**Files:**
- Create: `src/lib/weather.ts`
- Test: `src/lib/weather.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { mindWeather } from "@/lib/weather";

describe("mindWeather", () => {
  it("is clear with no thoughts", () => {
    expect(mindWeather(0)).toEqual({ kind: "clear", icon: "☀️", label: "Clear skies" });
  });

  it("steps through fair, cloudy and stormy at 1, 4 and 8 thoughts", () => {
    expect(mindWeather(1).kind).toBe("fair");
    expect(mindWeather(3).kind).toBe("fair");
    expect(mindWeather(4).kind).toBe("cloudy");
    expect(mindWeather(7).kind).toBe("cloudy");
    expect(mindWeather(8).kind).toBe("stormy");
    expect(mindWeather(50).kind).toBe("stormy");
  });

  it("labels every kind", () => {
    expect(mindWeather(2).label).toBe("Fair, a few clouds");
    expect(mindWeather(5).label).toBe("Cloudy mind");
    expect(mindWeather(9).label).toBe("Stormy mind");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/weather.test.ts`
Expected: FAIL — cannot resolve `@/lib/weather`.

- [ ] **Step 3: Implement**

```ts
export type WeatherKind = "clear" | "fair" | "cloudy" | "stormy";

export interface MindWeather {
  kind: WeatherKind;
  icon: string;
  label: string;
}

// How busy the day's sky looks. For now it counts thoughts; the AI day swaps
// the input for mood tags, and callers only ever see the result.
export function mindWeather(thoughtCount: number): MindWeather {
  if (thoughtCount <= 0) {
    return { kind: "clear", icon: "☀️", label: "Clear skies" };
  }
  if (thoughtCount <= 3) {
    return { kind: "fair", icon: "🌤", label: "Fair, a few clouds" };
  }
  if (thoughtCount <= 7) {
    return { kind: "cloudy", icon: "☁️", label: "Cloudy mind" };
  }
  return { kind: "stormy", icon: "⛈", label: "Stormy mind" };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/weather.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather.ts src/lib/weather.test.ts
git commit -m "feat: mind weather from the day's thought count"
```

---

### Task 3: Cloud sizing and jitter

**Files:**
- Create: `src/lib/clouds.ts`
- Test: `src/lib/clouds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { cloudJitter, cloudSize, seeded } from "@/lib/clouds";

describe("cloudSize", () => {
  it("buckets by length at 60 and 240 characters", () => {
    expect(cloudSize("")).toBe("s");
    expect(cloudSize("a".repeat(60))).toBe("s");
    expect(cloudSize("a".repeat(61))).toBe("m");
    expect(cloudSize("a".repeat(240))).toBe("m");
    expect(cloudSize("a".repeat(241))).toBe("l");
    expect(cloudSize("a".repeat(4096))).toBe("l");
  });
});

describe("seeded", () => {
  it("is deterministic and in [0, 1)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const value = seeded(seed, 0);
      expect(value).toBe(seeded(seed, 0));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("differs by salt", () => {
    expect(seeded(7, 0)).not.toBe(seeded(7, 1));
  });
});

describe("cloudJitter", () => {
  it("stays in range for many ids", () => {
    for (let id = 1; id <= 500; id++) {
      const { tilt, offsetY, bobSeconds, bobDelay } = cloudJitter(id);
      expect(tilt).toBeGreaterThanOrEqual(-3);
      expect(tilt).toBeLessThanOrEqual(3);
      expect(offsetY).toBeGreaterThanOrEqual(0);
      expect(offsetY).toBeLessThanOrEqual(16);
      expect(bobSeconds).toBeGreaterThanOrEqual(4);
      expect(bobSeconds).toBeLessThanOrEqual(7);
      expect(bobDelay).toBeGreaterThanOrEqual(0);
      expect(bobDelay).toBeLessThanOrEqual(3);
    }
  });

  it("is the same on every call, so server and client agree", () => {
    expect(cloudJitter(42)).toEqual(cloudJitter(42));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/clouds.test.ts`
Expected: FAIL — cannot resolve `@/lib/clouds`.

- [ ] **Step 3: Implement**

```ts
export type CloudSize = "s" | "m" | "l";

export function cloudSize(text: string): CloudSize {
  if (text.length <= 60) {
    return "s";
  }
  if (text.length <= 240) {
    return "m";
  }
  return "l";
}

// A stable number in [0, 1) from an integer seed, so the server and the
// browser draw the same sky without storing any layout. One round of the
// mulberry32 mixer; `salt` gives independent values for the same seed.
export function seeded(seed: number, salt: number): number {
  let t = (Math.imul(seed, 0x9e3779b1) + Math.imul(salt + 1, 0x85ebca6b)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function between(min: number, max: number, unit: number): number {
  return Math.round((min + (max - min) * unit) * 100) / 100;
}

export interface Jitter {
  tilt: number; // degrees
  offsetY: number; // px
  bobSeconds: number;
  bobDelay: number; // seconds
}

// Used for clouds (seeded by message id) and post-its (by question id).
export function cloudJitter(seed: number): Jitter {
  return {
    tilt: between(-3, 3, seeded(seed, 0)),
    offsetY: between(0, 16, seeded(seed, 1)),
    bobSeconds: between(4, 7, seeded(seed, 2)),
    bobDelay: between(0, 3, seeded(seed, 3)),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/clouds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clouds.ts src/lib/clouds.test.ts
git commit -m "feat: cloud sizing and deterministic jitter"
```

---

### Task 4: Board geometry helpers

**Files:**
- Create: `src/lib/board.ts`
- Test: `src/lib/board.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { boardRows, clamp01, defaultNotePosition, noteColor } from "@/lib/board";

describe("clamp01", () => {
  it("keeps values inside 0..1", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.7)).toBe(1);
  });
});

describe("noteColor", () => {
  it("cycles the four note colours", () => {
    expect(noteColor(0)).toBe("var(--note-1)");
    expect(noteColor(3)).toBe("var(--note-4)");
    expect(noteColor(5)).toBe("var(--note-2)");
  });
});

describe("boardRows", () => {
  it("fits four notes per row, at least one row", () => {
    expect(boardRows(0)).toBe(1);
    expect(boardRows(4)).toBe(1);
    expect(boardRows(5)).toBe(2);
  });
});

describe("defaultNotePosition", () => {
  it("lays notes left to right along the top row", () => {
    expect(defaultNotePosition(0, 3)).toEqual({ x: 0, y: 0 });
    expect(defaultNotePosition(2, 3)).toEqual({ x: 2 / 3, y: 0 });
    expect(defaultNotePosition(3, 4)).toEqual({ x: 1, y: 0 });
  });

  it("wraps to further rows spread top to bottom", () => {
    expect(defaultNotePosition(4, 6)).toEqual({ x: 0, y: 1 });
    expect(defaultNotePosition(4, 9)).toEqual({ x: 0, y: 0.5 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/board.test.ts`
Expected: FAIL — cannot resolve `@/lib/board`.

- [ ] **Step 3: Implement**

```ts
// Positions on the board are fractions (0..1) of the space a note can move
// in, so they survive any screen width.
export const BOARD_COLUMNS = 4;

const NOTE_COLORS = ["var(--note-1)", "var(--note-2)", "var(--note-3)", "var(--note-4)"];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function noteColor(index: number): string {
  return NOTE_COLORS[index % NOTE_COLORS.length];
}

export function boardRows(count: number): number {
  return Math.max(1, Math.ceil(count / BOARD_COLUMNS));
}

// Where a note sits before it's ever been dragged.
export function defaultNotePosition(index: number, count: number): { x: number; y: number } {
  const rows = boardRows(count);
  const column = index % BOARD_COLUMNS;
  const row = Math.floor(index / BOARD_COLUMNS);
  return { x: column / (BOARD_COLUMNS - 1), y: rows > 1 ? row / (rows - 1) : 0 };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board.ts src/lib/board.test.ts
git commit -m "feat: board geometry helpers for post-its"
```

---

### Task 5: Day keys and swipe mapping

**Files:**
- Create: `src/lib/day-keys.ts`
- Test: `src/lib/day-keys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { keyToAction, SWIPE_MIN_PX, swipeToDelta } from "@/lib/day-keys";

const free = { modified: false, busy: false };

describe("keyToAction", () => {
  it("maps arrows, t and n", () => {
    expect(keyToAction("ArrowLeft", free)).toEqual({ type: "shift", delta: -1 });
    expect(keyToAction("ArrowRight", free)).toEqual({ type: "shift", delta: 1 });
    expect(keyToAction("t", free)).toEqual({ type: "today" });
    expect(keyToAction("n", free)).toEqual({ type: "compose" });
  });

  it("ignores other keys", () => {
    expect(keyToAction("x", free)).toBeNull();
    expect(keyToAction("ArrowUp", free)).toBeNull();
  });

  it("does nothing with a modifier held or while something else owns the keys", () => {
    expect(keyToAction("ArrowLeft", { modified: true, busy: false })).toBeNull();
    expect(keyToAction("n", { modified: false, busy: true })).toBeNull();
  });
});

describe("swipeToDelta", () => {
  it("swiping left goes forward a day, right goes back", () => {
    expect(swipeToDelta(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeToDelta(SWIPE_MIN_PX + 20, 10)).toBe(-1);
  });

  it("ignores short or mostly vertical swipes", () => {
    expect(swipeToDelta(SWIPE_MIN_PX - 1, 0)).toBe(0);
    expect(swipeToDelta(-80, 90)).toBe(0);
    expect(swipeToDelta(80, 80)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/day-keys.test.ts`
Expected: FAIL — cannot resolve `@/lib/day-keys`.

- [ ] **Step 3: Implement**

```ts
export type DayKeyAction =
  | { type: "shift"; delta: -1 | 1 }
  | { type: "today" }
  | { type: "compose" };

// Plain keys only, and never while something else owns the keyboard: a text
// field, an open dialog, or a post-it being nudged with the arrows.
export function keyToAction(
  key: string,
  context: { modified: boolean; busy: boolean },
): DayKeyAction | null {
  if (context.modified || context.busy) {
    return null;
  }
  switch (key) {
    case "ArrowLeft":
      return { type: "shift", delta: -1 };
    case "ArrowRight":
      return { type: "shift", delta: 1 };
    case "t":
      return { type: "today" };
    case "n":
      return { type: "compose" };
    default:
      return null;
  }
}

export const SWIPE_MIN_PX = 60;

// Like turning a page: the finger moving left goes forward a day.
export function swipeToDelta(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) {
    return 0;
  }
  return dx < 0 ? 1 : -1;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/day-keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/day-keys.ts src/lib/day-keys.test.ts
git commit -m "feat: key and swipe mapping for flipping days"
```

---

### Task 6: Sticker list

**Files:**
- Create: `src/lib/sticker-list.ts`
- Test: `src/lib/sticker-list.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { isSticker, STICKER_NAMES, STICKERS } from "@/lib/sticker-list";

describe("isSticker", () => {
  it("accepts every listed sticker", () => {
    for (const sticker of STICKERS) {
      expect(isSticker(sticker)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isSticker("x")).toBe(false);
    expect(isSticker("")).toBe(false);
    expect(isSticker(1)).toBe(false);
    expect(isSticker(null)).toBe(false);
  });
});

describe("STICKER_NAMES", () => {
  it("names every sticker", () => {
    for (const sticker of STICKERS) {
      expect(STICKER_NAMES[sticker]).toMatch(/\w/);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/sticker-list.test.ts`
Expected: FAIL — cannot resolve `@/lib/sticker-list`.

- [ ] **Step 3: Implement**

```ts
// Kept apart from lib/stickers.ts (the database side) so client components
// can import the list without pulling in the database driver.
export const STICKERS = ["☀️", "🌤", "🌧", "⛈", "🔥", "🌱", "🌈", "⚡️", "🫠", "😌"] as const;

export type Sticker = (typeof STICKERS)[number];

// Read out by screen readers in place of the emoji.
export const STICKER_NAMES: Record<Sticker, string> = {
  "☀️": "sunny",
  "🌤": "bright",
  "🌧": "rainy",
  "⛈": "stormy",
  "🔥": "on fire",
  "🌱": "growing",
  "🌈": "hopeful",
  "⚡️": "wired",
  "🫠": "melting",
  "😌": "at peace",
};

export function isSticker(value: unknown): value is Sticker {
  return typeof value === "string" && (STICKERS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/sticker-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sticker-list.ts src/lib/sticker-list.test.ts
git commit -m "feat: the fixed list of day stickers"
```

---

### Task 7: Schema and data access

**Files:**
- Modify: `db/schema.sql` (append)
- Modify: `src/lib/checkins.ts` (`Answer`, `listAnswersForDay`, new `setAnswerPosition`)
- Create: `src/lib/stickers.ts`

No unit tests (these are thin SQL wrappers, like the existing ones); covered by the action tests' mocks and the manual run.

- [ ] **Step 1: Append to `db/schema.sql`**

```sql

-- Where a post-it sits on the board, as fractions of the space it can move
-- in. NULL means "default grid position".
ALTER TABLE answers ADD COLUMN IF NOT EXISTS board_x REAL
  CHECK (board_x BETWEEN 0 AND 1);
ALTER TABLE answers ADD COLUMN IF NOT EXISTS board_y REAL
  CHECK (board_y BETWEEN 0 AND 1);

-- One sticker per day, part of the private check-in.
CREATE TABLE IF NOT EXISTS day_stickers (
  day         DATE         PRIMARY KEY,
  sticker     TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Update `src/lib/checkins.ts`**

Replace the `Answer` interface:

```ts
export interface Answer {
  questionId: number;
  questionText: string;
  text: string;
  // Board position as fractions; null until the note is first moved.
  boardX: number | null;
  boardY: number | null;
}
```

Replace `listAnswersForDay`:

```ts
export async function listAnswersForDay(day: string): Promise<Answer[]> {
  const sql = getSql();
  const rows = await sql<
    {
      question_id: string;
      question_text: string;
      text: string;
      board_x: number | null;
      board_y: number | null;
    }[]
  >`
    SELECT a.question_id, a.question_text, a.text, a.board_x, a.board_y
    FROM answers a
    JOIN questions q ON q.id = a.question_id
    WHERE a.day = ${day}::date
    ORDER BY q.position, q.id
  `;
  return rows.map((row) => ({
    questionId: Number(row.question_id),
    questionText: row.question_text,
    text: row.text,
    boardX: row.board_x,
    boardY: row.board_y,
  }));
}
```

Add after `deleteAnswer`:

```ts
// Only moves an answer that exists; a note never saved has nowhere to keep
// its position. `upsertAnswer` leaves these columns alone, so a re-save keeps
// the note where it was.
export async function setAnswerPosition(
  day: string,
  questionId: number,
  x: number,
  y: number,
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE answers SET board_x = ${x}, board_y = ${y}
    WHERE day = ${day}::date AND question_id = ${questionId}
  `;
}
```

- [ ] **Step 3: Create `src/lib/stickers.ts`**

```ts
import { getSql } from "@/lib/db";
import type { Sticker } from "@/lib/sticker-list";

// `to_char` so the driver hands back "YYYY-MM-DD" strings rather than Dates.
export async function listDayStickers(from: string, to: string): Promise<Record<string, string>> {
  const sql = getSql();
  const rows = await sql<{ day: string; sticker: string }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, sticker
    FROM day_stickers
    WHERE day BETWEEN ${from}::date AND ${to}::date
  `;
  return Object.fromEntries(rows.map((row) => [row.day, row.sticker]));
}

export async function setDaySticker(day: string, sticker: Sticker): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO day_stickers (day, sticker)
    VALUES (${day}::date, ${sticker})
    ON CONFLICT (day) DO UPDATE SET sticker = EXCLUDED.sticker, updated_at = now()
  `;
}

export async function clearDaySticker(day: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM day_stickers WHERE day = ${day}::date`;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in `src/components/checkin-answers.tsx`/`page.tsx` if they construct `Answer` objects — they don't (they only read), so expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql src/lib/checkins.ts src/lib/stickers.ts
git commit -m "feat: note positions and day stickers in the schema"
```

---

### Task 8: Server actions for moving notes and day stickers

**Files:**
- Modify: `src/app/checkin-actions.ts`
- Test: `src/app/checkin-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/checkin-actions.test.ts`:

1. Add `setAnswerPosition: vi.fn(),` to the `vi.mock("@/lib/checkins", …)` object (keep alphabetical order, after `retireQuestion`).
2. Replace the `@/lib/days` mock so `parseDay` stays real:

```ts
vi.mock("@/lib/days", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/days")>()),
  today: vi.fn(),
}));
```

3. Add a stickers mock below it:

```ts
vi.mock("@/lib/stickers", () => ({
  clearDaySticker: vi.fn(),
  setDaySticker: vi.fn(),
}));
```

4. Extend the imports: add `moveNoteAction` and `setDayStickerAction` to the `@/app/checkin-actions` import, `setAnswerPosition` to the `@/lib/checkins` import, and add:

```ts
import { clearDaySticker, setDaySticker } from "@/lib/stickers";
```

5. Append:

```ts
describe("moveNoteAction", () => {
  it("saves a clamped position, on any day, and refreshes the page", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await moveNoteAction("2026-09-01", 1, 1.4, -0.2);

    expect(setAnswerPosition).toHaveBeenCalledWith("2026-09-01", 1, 1, 0);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(moveNoteAction(TODAY, 1, 0.5, 0.5)).rejects.toThrow("unauthorized");
    expect(setAnswerPosition).not.toHaveBeenCalled();
  });

  it("rejects a bad day, id or position", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await expect(moveNoteAction("yesterday", 1, 0.5, 0.5)).rejects.toThrow("invalid day");
    await expect(moveNoteAction(TODAY, 0, 0.5, 0.5)).rejects.toThrow("invalid question id");
    await expect(moveNoteAction(TODAY, 1, Number.NaN, 0.5)).rejects.toThrow("invalid position");
    await expect(
      moveNoteAction(TODAY, 1, 0.5, "0.5" as unknown as number),
    ).rejects.toThrow("invalid position");
    expect(setAnswerPosition).not.toHaveBeenCalled();
  });
});

describe("setDayStickerAction", () => {
  it("sets today's sticker and refreshes the page", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    expect(await setDayStickerAction(TODAY, "🔥")).toEqual({ ok: true });
    expect(setDaySticker).toHaveBeenCalledWith(TODAY, "🔥");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("clears today's sticker with null", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    expect(await setDayStickerAction(TODAY, null)).toEqual({ ok: true });
    expect(clearDaySticker).toHaveBeenCalledWith(TODAY);
    expect(setDaySticker).not.toHaveBeenCalled();
  });

  it("reports a day that has ended", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    expect(await setDayStickerAction("2026-09-29", "🔥")).toEqual({
      ok: false,
      reason: "day-ended",
    });
    expect(setDaySticker).not.toHaveBeenCalled();
    expect(clearDaySticker).not.toHaveBeenCalled();
  });

  it("rejects an unknown sticker", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await expect(setDayStickerAction(TODAY, "💩")).rejects.toThrow("invalid sticker");
    expect(setDaySticker).not.toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(setDayStickerAction(TODAY, "🔥")).rejects.toThrow("unauthorized");
    expect(setDaySticker).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/checkin-actions.test.ts`
Expected: FAIL — `moveNoteAction` / `setDayStickerAction` is not a function. The existing tests still pass.

- [ ] **Step 3: Implement**

In `src/app/checkin-actions.ts`, update imports:

```ts
import { isAdmin } from "@/lib/admin";
import { clamp01 } from "@/lib/board";
import {
  addQuestion,
  deleteAnswer,
  listActiveQuestions,
  moveQuestion,
  retireQuestion,
  setAnswerPosition,
  updateQuestionText,
  upsertAnswer,
} from "@/lib/checkins";
import { parseDay, today } from "@/lib/days";
import { isSticker } from "@/lib/sticker-list";
import { clearDaySticker, setDaySticker } from "@/lib/stickers";
```

Append at the end of the file:

```ts
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Any day, not just today: moving a note changes the board, not the answer.
export async function moveNoteAction(
  day: string,
  questionId: number,
  x: number,
  y: number,
): Promise<void> {
  await requireAdmin();
  const validDay = parseDay(day);
  if (validDay === null) {
    throw new Error("invalid day");
  }
  const id = requireId(questionId);
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    throw new Error("invalid position");
  }
  await setAnswerPosition(validDay, id, clamp01(x), clamp01(y));
  revalidatePath("/");
}

export type SetStickerResult = { ok: true } | { ok: false; reason: "day-ended" };

// Today only, like the check-in it belongs to. `null` clears it.
export async function setDayStickerAction(
  day: string,
  sticker: string | null,
): Promise<SetStickerResult> {
  await requireAdmin();
  if (sticker !== null && !isSticker(sticker)) {
    throw new Error("invalid sticker");
  }
  if (day !== today()) {
    return { ok: false, reason: "day-ended" };
  }
  if (sticker === null) {
    await clearDaySticker(day);
  } else {
    await setDaySticker(day, sticker);
  }
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/checkin-actions.ts src/app/checkin-actions.test.ts
git commit -m "feat: actions to move a post-it and set the day's sticker"
```

---

### Task 9: Themes, typography, motion CSS and the calm/loud switch

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/theme-provider.tsx`
- Create: `src/components/mode-switch.tsx`
- Delete: `src/components/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Rewrite `src/app/globals.css`**

Keep lines 1–3 (the three `@import`s) and the whole `@theme inline { … }` block exactly as they are. Delete the `@custom-variant dark …` line. Replace everything from `:root {` to the end of the file with:

```css
/* Loud: Riso Pop. Also the fallback before next-themes sets data-mode, so
   the calm blocks below must override every token defined here. */
:root,
[data-mode="loud"] {
  color-scheme: light;
  --paper: #FFF1DC;
  --surface: #FFFFFF;
  --ink: #111111;
  --ink-soft: #4A4038;
  --brand: #2340FF;
  --note-1: #FFE600;
  --note-2: #FF48B0;
  --note-3: #9EE6FF;
  --note-4: #B8F5A0;
  --stamp: #E5262B;
  --line: 2.5px;
  --shadow: 4px 4px 0 var(--ink);
  --shadow-sm: 2px 2px 0 var(--ink);
  --shadow-lift: 10px 12px 0 rgb(17 17 17 / 0.35);
  --cloud-filter: drop-shadow(2.5px 0 0 var(--ink)) drop-shadow(-2.5px 0 0 var(--ink))
    drop-shadow(0 2.5px 0 var(--ink)) drop-shadow(0 -2.5px 0 var(--ink))
    drop-shadow(4px 4px 0 var(--ink));
  --misprint: 3px 2px 0 var(--note-2);
  --grain-opacity: 0.35;
  --radius-note: 2px;
}

/* Calm: Sage Morning. */
[data-mode="calm"] {
  color-scheme: light;
  --paper: #E9EFE6;
  --surface: #FFFFFF;
  --ink: #33433A;
  --ink-soft: #5C6E63;
  --brand: #3E5A4A;
  --note-1: #F5EBCB;
  --note-2: #F0D9D9;
  --note-3: #D6E4EE;
  --note-4: #DDEAD3;
  --stamp: #B4544F;
  --line: 0px;
  --shadow: 0 6px 14px rgb(62 90 74 / 0.15);
  --shadow-sm: 0 2px 6px rgb(62 90 74 / 0.15);
  --shadow-lift: 0 16px 30px rgb(62 90 74 / 0.25);
  --cloud-filter: drop-shadow(0 6px 14px rgb(62 90 74 / 0.15));
  --misprint: none;
  --grain-opacity: 0.15;
  --radius-note: 6px;
}

/* Calm at night follows the system. Loud is always bright. */
@media (prefers-color-scheme: dark) {
  [data-mode="calm"] {
    color-scheme: dark;
    --paper: #1B221E;
    --surface: #26302A;
    --ink: #E3EBE4;
    --ink-soft: #A9B8AE;
    --brand: #9CC3AA;
    --note-1: #5A5238;
    --note-2: #5A3F44;
    --note-3: #3A4A57;
    --note-4: #3E5040;
    --stamp: #D98A84;
    --shadow: 0 6px 14px rgb(0 0 0 / 0.35);
    --shadow-sm: 0 2px 6px rgb(0 0 0 / 0.35);
    --shadow-lift: 0 16px 30px rgb(0 0 0 / 0.45);
    --cloud-filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.35));
    --grain-opacity: 0.1;
  }
}

/* shadcn and the older components read these names; they all follow the
   mode through the tokens above. */
:root {
  --radius: 1rem;
  --background: var(--paper);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface);
  --popover-foreground: var(--ink);
  --primary: var(--brand);
  --primary-foreground: var(--surface);
  --secondary: var(--paper);
  --secondary-foreground: var(--ink);
  --muted: var(--paper);
  --muted-foreground: var(--ink-soft);
  --accent: var(--note-1);
  --accent-foreground: var(--ink);
  --destructive: var(--stamp);
  --border: color-mix(in srgb, var(--ink) 18%, transparent);
  --border-strong: color-mix(in srgb, var(--ink) 40%, transparent);
  --input: var(--border);
  --ring: var(--brand);
  --chart-1: var(--brand);
  --chart-2: var(--note-2);
  --chart-3: var(--note-1);
  --chart-4: var(--note-3);
  --chart-5: var(--note-4);
  --sidebar: var(--paper);
  --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--brand);
  --sidebar-primary-foreground: var(--surface);
  --sidebar-accent: var(--note-1);
  --sidebar-accent-foreground: var(--ink);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--brand);
  --text-secondary: var(--ink-soft);
  --text-muted: var(--ink-soft);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}

/* Paper grain over everything; never catches a click. */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  opacity: var(--grain-opacity);
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .28 0 0 0 0 .2 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}

@layer components {
  .misprint {
    text-shadow: var(--misprint);
  }

  /* Small raised things: buttons, chips. */
  .pop {
    background: var(--surface);
    border: var(--line) solid var(--ink);
    box-shadow: var(--shadow-sm);
  }

  /* Big raised things: the calendar, dialogs. */
  .pop-lg {
    border: var(--line) solid var(--ink);
    box-shadow: var(--shadow);
  }

  /* Clouds: an outlined union of a body and three bumps, drawn behind the
     text. The outline is a stack of drop-shadows so it hugs the whole shape. */
  .cloud {
    position: relative;
    isolation: isolate;
    rotate: var(--tilt, 0deg);
  }
  .bobbing {
    animation: bob var(--bob-duration, 5s) ease-in-out var(--bob-delay, 0s) infinite;
  }
  .cloud-shape {
    position: absolute;
    inset: 0;
    z-index: -1;
    filter: var(--cloud-filter);
  }
  .cloud-shape > span {
    position: absolute;
    background: var(--surface);
    border-radius: 9999px;
  }
  .cloud-shape > .cloud-body {
    inset: 32px 0 0 0;
    border-radius: 36px;
  }
  .cloud-shape > .cloud-bump-1 {
    width: 56px;
    height: 56px;
    left: 12%;
    top: 14px;
  }
  .cloud-shape > .cloud-bump-2 {
    width: 80px;
    height: 80px;
    left: 38%;
    top: 0;
  }
  .cloud-shape > .cloud-bump-3 {
    width: 52px;
    height: 52px;
    right: 12%;
    top: 18px;
  }
  .cloud.is-puffing {
    animation: puff 0.4s ease-in forwards;
  }
  .cloud.is-rising {
    animation: rise 0.6s ease-in forwards;
  }

  /* The sky band tints with the day's weather. */
  .sky {
    border-radius: 2rem;
    padding: 2rem 1.5rem;
    transition: background-color 0.3s;
  }
  .sky[data-weather="fair"] {
    background: color-mix(in srgb, var(--note-3) 15%, transparent);
  }
  .sky[data-weather="cloudy"] {
    background: color-mix(in srgb, var(--note-3) 30%, transparent);
  }
  .sky[data-weather="stormy"] {
    background: color-mix(in srgb, var(--note-3) 50%, transparent);
  }

  /* Post-its. Phones: a two-column grid, notes grow with their text.
     Desktop: a free board, notes are a fixed size placed at --x/--y. */
  .board {
    --note-w: 100%;
    --note-h: 10rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }
  .note {
    position: relative;
    display: flex;
    flex-direction: column;
    width: var(--note-w);
    min-height: var(--note-h);
    padding: 1.75rem 1rem 1rem;
    background: var(--note);
    color: var(--ink);
    border: var(--line) solid var(--ink);
    border-radius: var(--radius-note);
    box-shadow: var(--shadow);
    rotate: var(--tilt, 0deg);
  }
  .note.is-dragging {
    z-index: 10;
    scale: 1.04;
    box-shadow: var(--shadow-lift);
  }
  .note.is-slapping {
    animation: slap 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
    animation-delay: var(--slap-delay, 0s);
  }
  .note-tape {
    position: absolute;
    top: -11px;
    left: 50%;
    width: 72px;
    height: 22px;
    translate: -50% 0;
    rotate: -4deg;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    border: var(--line) solid var(--ink);
  }
  @media (min-width: 48rem) {
    .board {
      --note-w: 13rem;
      --note-h: 12rem;
      position: relative;
      display: block;
      min-height: var(--board-h);
    }
    .board .note {
      position: absolute;
      height: var(--note-h);
      overflow: hidden;
      left: calc(var(--x) * (100% - var(--note-w)));
      top: calc(var(--y) * (100% - var(--note-h)));
    }
    .board .note-tape {
      cursor: grab;
      touch-action: none;
    }
    .board .note.is-dragging .note-tape {
      cursor: grabbing;
    }
  }

  /* Tear-off calendar. */
  .tear-page {
    transform-origin: top center;
  }
  .tear-page.is-tearing {
    animation: tear 0.3s ease-in forwards;
  }
  .tear-page.is-settling {
    animation: settle 0.25s ease-out both;
  }
  .stamp {
    position: absolute;
    left: 50%;
    top: 42%;
    translate: -50% -50%;
    rotate: -14deg;
    padding: 2px 6px;
    border: 3px solid var(--stamp);
    border-radius: 4px;
    color: var(--stamp);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    opacity: 0.85;
  }
  .stamp.is-thunking {
    animation: stamp 0.5s ease-out both;
  }
}

@keyframes bob {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -6px; }
}
@keyframes puff {
  to { transform: scale(1.3); filter: blur(6px); opacity: 0; }
}
@keyframes rise {
  to { transform: translateY(-40vh) scale(0.85); opacity: 0; }
}
@keyframes slap {
  0% { transform: translateY(-80px) scale(1.15); opacity: 0; }
  60% { transform: translateY(4px) scale(0.97); opacity: 1; }
  100% { transform: none; opacity: 1; }
}
@keyframes stamp {
  0% { transform: scale(2.4); opacity: 0; }
  70% { transform: scale(0.92); opacity: 0.95; }
  100% { transform: scale(1); opacity: 0.85; }
}
@keyframes tear {
  to { transform: perspective(400px) rotateX(-100deg); opacity: 0; }
}
@keyframes settle {
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Rewrite `src/components/theme-provider.tsx`**

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ReactNode } from "react";

// "Theme" here is the calm/loud mode. Calm's night variant comes from the
// system's colour scheme in CSS, so next-themes doesn't track it. A new
// storage key, so a "dark" saved by the old toggle isn't read as a mode.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-mode"
      themes={["loud", "calm"]}
      defaultTheme="loud"
      enableSystem={false}
      storageKey="daily-thoughts-mode"
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 3: Create `src/components/mode-switch.tsx`**

```tsx
"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const subscribe = () => () => {};

// The saved mode is only known in the browser, so the server render (and the
// first client render) draw the default, loud.
export function ModeSwitch() {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const isLoud = !hydrated || theme !== "calm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLoud}
      aria-label="Loud mode"
      onClick={() => setTheme(isLoud ? "calm" : "loud")}
      className="pop flex h-10 cursor-pointer items-center rounded-full p-1 text-[12px] font-bold uppercase tracking-wide"
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors duration-200",
          !isLoud && "bg-[var(--ink)] text-[var(--paper)]",
        )}
      >
        calm
      </span>
      <span
        aria-hidden
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors duration-200",
          isLoud && "bg-[var(--ink)] text-[var(--note-1)]",
        )}
      >
        loud
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Delete the old toggle**

Run: `git rm src/components/theme-toggle.tsx`

- [ ] **Step 5: Rewrite `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat, Inter } from "next/font/google";
import Link from "next/link";
import { Cloud, ListChecks } from "lucide-react";

import "./globals.css";
import { ComposeDialog } from "@/components/compose-dialog";
import { ModeSwitch } from "@/components/mode-switch";
import { ThemeProvider } from "@/components/theme-provider";
import { isAdmin } from "@/lib/admin";

const bricolage = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["800"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Daily Thoughts",
  description: "Thoughts sent to a Telegram bot, collected on one page",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const canWrite = await isAdmin();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bricolage.variable} ${inter.variable} ${caveat.variable} antialiased`}>
        <ThemeProvider>
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-[length:var(--line)] border-[var(--ink)] bg-[var(--paper)]/90 px-4 py-4 backdrop-blur-md sm:px-10">
            <Link href="/" className="flex items-center gap-3">
              <span className="pop hidden h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] sm:flex">
                <Cloud className="h-5 w-5 text-[var(--surface)]" strokeWidth={2.5} />
              </span>
              <span className="misprint font-heading text-xl tracking-tight text-[var(--brand)] sm:text-2xl">
                Daily Thoughts
              </span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              {canWrite && (
                <Link
                  href="/questions"
                  className="pop flex h-10 w-10 items-center justify-center rounded-xl"
                >
                  <ListChecks className="h-4 w-4" />
                  <span className="sr-only">Questions</span>
                </Link>
              )}
              {canWrite && <ComposeDialog />}
              <ModeSwitch />
            </div>
          </header>
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

(The old `HeaderDate` is gone: the calendar now shows the date.)

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/globals.css src/app/layout.tsx src/components/theme-provider.tsx src/components/mode-switch.tsx src/components/theme-toggle.tsx
git commit -m "feat: Riso Pop and Sage Morning themes with a calm/loud switch"
```

---

### Task 10: Client event helpers and the cloud shape

**Files:**
- Create: `src/lib/ui-events.ts`
- Create: `src/components/cloud-shape.tsx`

- [ ] **Step 1: Create `src/lib/ui-events.ts`**

```ts
// Window-level events so far-apart client components can talk without a
// shared provider: the keyboard handler asks the calendar to flip, the board
// tells the calendar to stamp, and so on. Browser only.
export const FLIP_DAY = "daily-thoughts:flip-day"; // detail: { delta: -1 | 1 }
export const OPEN_COMPOSER = "daily-thoughts:open-composer";
export const CHECKIN_SAVED = "daily-thoughts:checkin-saved"; // detail: { filled: boolean }

export function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Resolves once an exit animation has had time to play, or straight away when
// motion is reduced (the CSS skips the animation then too).
export function afterAnimation(ms: number): Promise<void> {
  if (prefersReducedMotion()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Create `src/components/cloud-shape.tsx`**

```tsx
// The outline drawn behind a cloud's content. Styles live in globals.css
// (.cloud-shape); the parent needs the .cloud class.
export function CloudShape() {
  return (
    <div aria-hidden className="cloud-shape">
      <span className="cloud-body" />
      <span className="cloud-bump-1" />
      <span className="cloud-bump-2" />
      <span className="cloud-bump-3" />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui-events.ts src/components/cloud-shape.tsx
git commit -m "feat: client event helpers and the cloud shape"
```

---

### Task 11: Thoughts as clouds in the sky

**Files:**
- Create: `src/components/thought-cloud.tsx`
- Create: `src/components/sky.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/components/message-list.tsx`, `src/components/delete-message-button.tsx`

- [ ] **Step 1: Create `src/components/thought-cloud.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";

import { deleteMessageAction } from "@/app/actions";
import { CloudShape } from "@/components/cloud-shape";
import { cloudJitter } from "@/lib/clouds";
import type { CloudSize } from "@/lib/clouds";
import { afterAnimation } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

const PUFF_MS = 400;

const SIZE_CLASSES: Record<CloudSize, string> = {
  s: "max-w-[240px] text-[17px]",
  m: "max-w-[340px] text-[15px]",
  l: "max-w-[520px] text-[14px]",
};

export function ThoughtCloud({
  id,
  text,
  size,
  time,
  isoTime,
  source,
  canDelete,
}: {
  id: number;
  text: string;
  size: CloudSize;
  time: string;
  isoTime: string;
  source: string;
  canDelete: boolean;
}) {
  const [isPuffing, setIsPuffing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { tilt, offsetY, bobSeconds, bobDelay } = cloudJitter(id);

  // The cloud puffs away first, then the row is deleted. If that fails it
  // comes back.
  function handleDelete() {
    if (!window.confirm("Delete this thought? This can't be undone.")) {
      return;
    }
    setIsPuffing(true);
    startTransition(async () => {
      await afterAnimation(PUFF_MS);
      try {
        await deleteMessageAction(id);
      } catch (error) {
        console.error("failed to delete message", error);
        setIsPuffing(false);
        window.alert("Couldn't delete the thought.");
      }
    });
  }

  return (
    <li
      className={cn(
        "cloud bobbing group min-w-[180px] px-7 pb-6 pt-12",
        SIZE_CLASSES[size],
        isPuffing && "is-puffing",
      )}
      style={
        {
          "--tilt": `${tilt}deg`,
          "--bob-duration": `${bobSeconds}s`,
          "--bob-delay": `${bobDelay}s`,
          marginTop: offsetY,
        } as CSSProperties
      }
    >
      <CloudShape />
      {/* Room for the AI day: a mood sticker top-left, a pattern tape along the bottom. */}
      <p className="whitespace-pre-wrap break-words leading-snug">{text}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--ink-soft)]">
        <span>
          <time dateTime={isoTime}>{time}</time> · via {source}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full opacity-0 transition-opacity duration-200 hover:bg-[var(--note-1)] focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-wait [@media(hover:none)]:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Delete thought</span>
          </button>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Create `src/components/sky.tsx`**

```tsx
import { ThoughtCloud } from "@/components/thought-cloud";
import { cloudSize } from "@/lib/clouds";
import { TIME_ZONE } from "@/lib/days";
import type { Message, MessageSource } from "@/lib/messages";
import type { MindWeather } from "@/lib/weather";

const SOURCE_LABELS: Record<MessageSource, string> = {
  telegram: "Telegram",
  web: "web",
};

// Formatted here, on the server, where TIME_ZONE is configured.
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Sky({
  messages,
  canDelete,
  weather,
}: {
  messages: Message[];
  canDelete: boolean;
  weather: MindWeather;
}) {
  return (
    <section aria-label="Thoughts" data-weather={weather.kind} className="sky">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span aria-hidden className="text-5xl">
            ☀️
          </span>
          <p className="font-heading text-xl">Clear skies.</p>
          <p className="text-[15px] text-[var(--ink-soft)]">No thoughts this day.</p>
        </div>
      ) : (
        <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
          {messages.map((message) => (
            <ThoughtCloud
              key={message.id}
              id={message.id}
              text={message.text}
              size={cloudSize(message.text)}
              time={formatTime(message.sentAt)}
              isoTime={message.sentAt.toISOString()}
              source={SOURCE_LABELS[message.source]}
              canDelete={canDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Use the sky in `src/app/page.tsx`**

Replace the `MessageList` import with:

```tsx
import { Sky } from "@/components/sky";
import { mindWeather } from "@/lib/weather";
```

Replace the whole "Thoughts" block:

```tsx
            <div className="flex flex-col gap-3">
              <SectionTitle>Thoughts</SectionTitle>
              {data.messages.length === 0 ? (
                <Notice>No thoughts this day.</Notice>
              ) : (
                <MessageList messages={data.messages} canDelete={isOwner} />
              )}
            </div>
```

with:

```tsx
            <Sky
              messages={data.messages}
              canDelete={isOwner}
              weather={mindWeather(data.messages.length)}
            />
```

(Task 15 rebuilds the whole page; this keeps the app working in between.)

- [ ] **Step 4: Delete the old list**

Run: `git rm src/components/message-list.tsx src/components/delete-message-button.tsx`

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/thought-cloud.tsx src/components/sky.tsx src/app/page.tsx src/components/message-list.tsx src/components/delete-message-button.tsx
git commit -m "feat: thoughts float as clouds that puff away on delete"
```

---

### Task 12: Month popover and tear-off calendar

**Files:**
- Modify: `src/components/month-calendar.tsx` (restyle, `onNavigate` prop)
- Create: `src/components/month-popover.tsx`
- Create: `src/components/tear-off-calendar.tsx`

- [ ] **Step 1: Rewrite `src/components/month-calendar.tsx`**

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatDayHeading, formatMonthLabel, monthGrid, shiftMonth } from "@/lib/days";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NAV_LINK =
  "flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--note-1)] hover:text-[var(--ink)]";

// Links rather than client state: each day is its own URL, so the back button
// and bookmarks work. prefetch is off because every link is a dynamic page
// that hits the database. `onNavigate` lets the popover close on a pick.
export function MonthCalendar({
  selectedDay,
  today,
  markedDays,
  onNavigate,
}: {
  selectedDay: string;
  today: string;
  markedDays: string[];
  onNavigate?: () => void;
}) {
  const marked = new Set(markedDays);

  return (
    <nav aria-label="Calendar">
      <div className="flex items-center justify-between">
        <Link
          href={`/?day=${shiftMonth(selectedDay, -1)}`}
          prefetch={false}
          onClick={onNavigate}
          className={NAV_LINK}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous month</span>
        </Link>
        <p className="font-heading text-[16px]">{formatMonthLabel(selectedDay)}</p>
        <Link
          href={`/?day=${shiftMonth(selectedDay, 1)}`}
          prefetch={false}
          onClick={onNavigate}
          className={NAV_LINK}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next month</span>
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} aria-hidden className="text-[11px] font-semibold text-[var(--ink-soft)]">
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
                onClick={onNavigate}
                aria-current={day === selectedDay ? "page" : undefined}
                aria-label={`${formatDayHeading(day)}${day === today ? ", today" : ""}${marked.has(day) ? ", has entries" : ""}`}
                className={cn(
                  "flex h-9 flex-col items-center justify-center rounded-md text-[13px] transition-colors duration-200 hover:bg-[var(--note-1)]",
                  day === today && "font-bold text-[var(--brand)] underline underline-offset-2",
                  day === selectedDay &&
                    "bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]",
                )}
              >
                {Number(day.slice(8))}
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-1 rounded-full",
                    day === selectedDay ? "bg-[var(--paper)]" : "bg-[var(--brand)]",
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

- [ ] **Step 2: Create `src/components/month-popover.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { MonthCalendar } from "@/components/month-calendar";

// The full month in a modal, shared by the tear-off calendar and the dock.
export function MonthPopover({
  open,
  onClose,
  selectedDay,
  today,
  markedDays,
}: {
  open: boolean;
  onClose: () => void;
  selectedDay: string;
  today: string;
  markedDays: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Pick a day"
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="pop-lg m-auto w-[min(360px,calc(100%-2rem))] rounded-2xl bg-[var(--surface)] p-4 text-[var(--ink)] backdrop:bg-black/40"
    >
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--note-1)]"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <MonthCalendar
        selectedDay={selectedDay}
        today={today}
        markedDays={markedDays}
        onNavigate={onClose}
      />
    </dialog>
  );
}
```

- [ ] **Step 3: Create `src/components/tear-off-calendar.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { MonthPopover } from "@/components/month-popover";
import { dayParts, shiftDay } from "@/lib/days";
import { afterAnimation, CHECKIN_SAVED, FLIP_DAY } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

const TEAR_MS = 300;

const NAV_BUTTON =
  "pop flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-transform duration-150 hover:-translate-y-0.5";

// The one place that moves between days with the tear animation. It's mounted
// on every screen size (hidden on phones) so the keyboard and swipe handlers
// can ask it to flip through FLIP_DAY.
export function TearOffCalendar({
  day,
  today,
  sticker,
  checkedIn,
  markedDays,
}: {
  day: string;
  today: string;
  sticker: string | null;
  checkedIn: boolean;
  markedDays: string[];
}) {
  const router = useRouter();
  const [tearingDay, setTearingDay] = useState<string | null>(null);
  // The day a save just stamped (plays the thunk), or null after a save that
  // left the check-in empty.
  const [stamped, setStamped] = useState<{ day: string; filled: boolean } | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const { month, date, weekday } = dayParts(day);
  const isTearing = tearingDay === day;
  const justStamped = stamped?.day === day && stamped.filled;
  const showStamp = stamped?.day === day ? stamped.filled : checkedIn;

  async function flip(delta: number) {
    if (isTearing) {
      return;
    }
    setTearingDay(day);
    await afterAnimation(TEAR_MS);
    router.push(`/?day=${shiftDay(day, delta)}`);
  }

  const onFlip = useEffectEvent((delta: number) => {
    void flip(delta);
  });
  const onSaved = useEffectEvent((filled: boolean) => {
    setStamped({ day, filled });
  });

  useEffect(() => {
    function handleFlip(event: Event) {
      onFlip((event as CustomEvent<{ delta: number }>).detail.delta);
    }
    function handleSaved(event: Event) {
      onSaved((event as CustomEvent<{ filled: boolean }>).detail.filled);
    }
    window.addEventListener(FLIP_DAY, handleFlip);
    window.addEventListener(CHECKIN_SAVED, handleSaved);
    return () => {
      window.removeEventListener(FLIP_DAY, handleFlip);
      window.removeEventListener(CHECKIN_SAVED, handleSaved);
    };
  }, []);

  return (
    <div className="w-36 rotate-3 select-none">
      <p className="rounded-t-lg border-[length:var(--line)] border-b-0 border-[var(--ink)] bg-[var(--brand)] py-1 text-center font-heading text-sm uppercase tracking-widest text-[var(--surface)]">
        {month}
      </p>
      <div
        key={day}
        className={cn(
          "tear-page pop-lg relative rounded-b-lg bg-[var(--surface)] px-2 pb-3 pt-2 text-center",
          isTearing ? "is-tearing" : "is-settling",
        )}
      >
        <p className="font-heading text-6xl leading-none">{date}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wider">{weekday}</p>
        {day === today && (
          <p className="text-[10px] font-semibold uppercase text-[var(--brand)]">today</p>
        )}
        {sticker && (
          <span role="img" aria-label="Day sticker" className="absolute -right-3 -top-3 text-3xl">
            {sticker}
          </span>
        )}
        {showStamp && <span className={cn("stamp", justStamped && "is-thunking")}>Checked in</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => flip(-1)} className={NAV_BUTTON}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous day</span>
        </button>
        <button type="button" onClick={() => setMonthOpen(true)} className={NAV_BUTTON}>
          <CalendarDays className="h-4 w-4" />
          <span className="sr-only">Pick a day</span>
        </button>
        <button type="button" onClick={() => flip(1)} className={NAV_BUTTON}>
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next day</span>
        </button>
      </div>
      <MonthPopover
        open={monthOpen}
        onClose={() => setMonthOpen(false)}
        selectedDay={day}
        today={today}
        markedDays={markedDays}
      />
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`page.tsx` still renders `MonthCalendar` without `onNavigate`, which is optional.)

- [ ] **Step 5: Commit**

```bash
git add src/components/month-calendar.tsx src/components/month-popover.tsx src/components/tear-off-calendar.tsx
git commit -m "feat: tear-off desk calendar with a month popover"
```

---

### Task 13: Timeline dock for phones

**Files:**
- Create: `src/components/timeline-dock.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MonthPopover } from "@/components/month-popover";
import { dayParts, formatDayHeading, monthGrid, shiftMonth } from "@/lib/days";
import { cn } from "@/lib/utils";

const DOCK_BUTTON = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

// Phones only: one dot per day of the month in a scroller. A dot is the
// day's sticker if it has one, pink for a check-in, yellow for thoughts.
export function TimelineDock({
  day,
  today,
  messageDays,
  checkinDays,
  stickers,
}: {
  day: string;
  today: string;
  messageDays: string[];
  checkinDays: string[];
  stickers: Record<string, string>;
}) {
  const selectedRef = useRef<HTMLAnchorElement>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const days = monthGrid(day)
    .flat()
    .filter((cell): cell is string => cell !== null);
  const withThoughts = new Set(messageDays);
  const withCheckin = new Set(checkinDays);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [day]);

  return (
    <nav
      aria-label="Days"
      className="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-full bg-[var(--ink)] px-2 py-2 text-[var(--paper)] shadow-[var(--shadow)] md:hidden"
    >
      <Link href={`/?day=${shiftMonth(day, -1)}`} prefetch={false} className={DOCK_BUTTON}>
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous month</span>
      </Link>
      <button
        type="button"
        onClick={() => setMonthOpen(true)}
        className="shrink-0 cursor-pointer px-1 font-heading text-xs uppercase tracking-wider text-[var(--note-1)]"
      >
        {dayParts(day).month.slice(0, 3)}
        <span className="sr-only">, pick a day</span>
      </button>
      <ol className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {days.map((cell) => {
          const selected = cell === day;
          const sticker = stickers[cell];
          const hasEntries = withThoughts.has(cell) || withCheckin.has(cell);
          return (
            <li key={cell} className="shrink-0">
              <Link
                ref={selected ? selectedRef : undefined}
                href={`/?day=${cell}`}
                prefetch={false}
                aria-current={selected ? "page" : undefined}
                aria-label={`${formatDayHeading(cell)}${cell === today ? ", today" : ""}${hasEntries ? ", has entries" : ""}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  selected && "bg-[var(--paper)] ring-2 ring-[var(--brand)]",
                )}
              >
                {sticker ? (
                  <span aria-hidden className="text-base leading-none">
                    {sticker}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "rounded-full",
                      selected ? "h-3 w-3" : "h-2 w-2",
                      withCheckin.has(cell)
                        ? "bg-[var(--note-2)]"
                        : withThoughts.has(cell)
                          ? "bg-[var(--note-1)]"
                          : selected
                            ? "bg-[var(--ink)]"
                            : "bg-[var(--paper)] opacity-30",
                      cell === today &&
                        !selected &&
                        "ring-2 ring-[var(--note-1)] ring-offset-1 ring-offset-[var(--ink)]",
                    )}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      <Link href={`/?day=${shiftMonth(day, 1)}`} prefetch={false} className={DOCK_BUTTON}>
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next month</span>
      </Link>
      <MonthPopover
        open={monthOpen}
        onClose={() => setMonthOpen(false)}
        selectedDay={day}
        today={today}
        markedDays={[...messageDays, ...checkinDays]}
      />
    </nav>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/timeline-dock.tsx
git commit -m "feat: timeline dock for flipping days on phones"
```

---

### Task 14: Post-its board (write, slap, drag) and day sticker

**Files:**
- Create: `src/components/post-it.tsx`
- Create: `src/components/board.tsx`
- Create: `src/components/day-sticker-picker.tsx`

- [ ] **Step 1: Create `src/components/post-it.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface NotePosition {
  x: number;
  y: number;
}

const LABEL = "text-[11px] font-bold uppercase leading-snug tracking-wide";

// One note on the board. Placement, colour and tilt come in as CSS variables
// read by .note in globals.css; `handle` is the strip of tape on top.
export function PostIt({
  label,
  labelFor,
  color,
  tilt,
  position,
  handle,
  isSlapping = false,
  slapDelay = 0,
  isDragging = false,
  children,
}: {
  label: string;
  labelFor?: string;
  color: string;
  tilt: number;
  position: NotePosition;
  handle: ReactNode;
  isSlapping?: boolean;
  slapDelay?: number;
  isDragging?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("note", isSlapping && "is-slapping", isDragging && "is-dragging")}
      style={
        {
          "--note": color,
          "--tilt": `${tilt}deg`,
          "--x": String(position.x),
          "--y": String(position.y),
          "--slap-delay": `${slapDelay}s`,
        } as CSSProperties
      }
    >
      {handle}
      {labelFor ? (
        <label htmlFor={labelFor} className={LABEL}>
          {label}
        </label>
      ) : (
        <p className={LABEL}>{label}</p>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/board.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent } from "react";

import { moveNoteAction, saveCheckinAction } from "@/app/checkin-actions";
import { PostIt } from "@/components/post-it";
import type { NotePosition } from "@/components/post-it";
import { boardRows, clamp01, defaultNotePosition, noteColor } from "@/lib/board";
import { cloudJitter } from "@/lib/clouds";
import { CHECKIN_SAVED, emit } from "@/lib/ui-events";

export interface BoardNote {
  id: number; // question id
  label: string;
  text: string;
  position: NotePosition | null;
}

type Status = "idle" | "saved" | "day-ended" | "questions-changed" | "error";

// idle is deliberately empty: the live region below only ever announces a
// save result, never the static hint.
const STATUS_TEXT: Record<Status, string> = {
  idle: "",
  saved: "Stuck!",
  // The drafts survive only until the next revalidation remounts this board
  // under the new day's key (e.g. the midnight rollover) — an accepted
  // limitation, since there's nowhere else to keep them once that happens.
  "day-ended": "This day has ended. Your drafts are still here. Copy them, then refresh.",
  "questions-changed": "Your questions changed. The board is updated; review and save again.",
  error: "Couldn't save the check-in.",
};

const DESKTOP = "(min-width: 48rem)";
const NUDGE = 0.05;
const NUDGES: Record<string, [number, number]> = {
  ArrowLeft: [-NUDGE, 0],
  ArrowRight: [NUDGE, 0],
  ArrowUp: [0, -NUDGE],
  ArrowDown: [0, NUDGE],
};
const SLAP_STAGGER_S = 0.06;
const ROW_REM = 14; // a 12rem note plus room to breathe

// The check-in as post-its. Today's notes are written on and saved together;
// any day's notes can be dragged around on desktop by their tape.
export function Board({
  day,
  editable,
  notes,
}: {
  day: string;
  editable: boolean;
  notes: BoardNote[];
}) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(notes.map((note) => [note.id, note.text])),
  );
  const [positions, setPositions] = useState<Record<number, NotePosition>>(() =>
    Object.fromEntries(
      notes.flatMap((note) => (note.position ? [[note.id, note.position] as const] : [])),
    ),
  );
  // Notes whose answer exists in the database, so their position can be saved.
  const [saved, setSaved] = useState<Set<number>>(
    () => new Set(notes.filter((note) => note.text.trim().length > 0).map((note) => note.id)),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [slapRound, setSlapRound] = useState(0);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    origin: NotePosition;
    latest: NotePosition | null;
  } | null>(null);
  const nudged = useRef<{ id: number; position: NotePosition } | null>(null);
  // Moved before their answer was saved; persisted once it is.
  const movedUnsaved = useRef(new Set<number>());
  const [isPending, startTransition] = useTransition();

  function positionOf(id: number, index: number): NotePosition {
    return positions[id] ?? defaultNotePosition(index, notes.length);
  }

  function persist(id: number, position: NotePosition) {
    if (!saved.has(id)) {
      movedUnsaved.current.add(id);
      return;
    }
    moveNoteAction(day, id, position.x, position.y).catch((error) => {
      console.error("failed to move note", error);
    });
  }

  function place(id: number, position: NotePosition) {
    setPositions((current) => ({ ...current, [id]: position }));
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, id: number, origin: NotePosition) {
    if (!window.matchMedia(DESKTOP).matches) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, startX: event.clientX, startY: event.clientY, origin, latest: null };
    setDraggingId(id);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    const board = boardRef.current;
    const note = event.currentTarget.parentElement;
    if (!current || !board || !note) {
      return;
    }
    const rect = board.getBoundingClientRect();
    const spanX = rect.width - note.offsetWidth;
    const spanY = rect.height - note.offsetHeight;
    const next = {
      x: clamp01(current.origin.x + (spanX > 0 ? (event.clientX - current.startX) / spanX : 0)),
      y: clamp01(current.origin.y + (spanY > 0 ? (event.clientY - current.startY) / spanY : 0)),
    };
    current.latest = next;
    place(current.id, next);
  }

  function handlePointerUp() {
    const current = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (current?.latest) {
      persist(current.id, current.latest);
    }
  }

  function handleTapeKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: number, origin: NotePosition) {
    const step = NUDGES[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = { x: clamp01(origin.x + step[0]), y: clamp01(origin.y + step[1]) };
    nudged.current = { id, position: next };
    place(id, next);
  }

  function handleTapeBlur(id: number) {
    if (nudged.current?.id === id) {
      persist(id, nudged.current.position);
      nudged.current = null;
    }
  }

  function update(id: number, value: string) {
    setDrafts((current) => ({ ...current, [id]: value }));
    setStatus("idle");
  }

  function save() {
    if (isPending) {
      return;
    }
    // Cleared up front so the live region always transitions through empty:
    // saving twice in a row still announces the second time.
    setStatus("idle");
    startTransition(async () => {
      try {
        const result = await saveCheckinAction(
          day,
          notes.map((note) => ({ questionId: note.id, text: drafts[note.id] ?? "" })),
        );
        if (result.ok) {
          const filled = notes
            .filter((note) => (drafts[note.id] ?? "").trim().length > 0)
            .map((note) => note.id);
          setSaved(new Set(filled));
          setStatus("saved");
          setSlapRound((round) => round + 1);
          emit(CHECKIN_SAVED, { filled: filled.length > 0 });
          // Notes dragged before they existed keep where they were put.
          for (const id of filled) {
            const position = positions[id];
            if (movedUnsaved.current.has(id) && position) {
              moveNoteAction(day, id, position.x, position.y).catch((error) => {
                console.error("failed to move note", error);
              });
            }
          }
          movedUnsaved.current.clear();
        } else if (result.reason === "questions-changed") {
          setStatus("questions-changed");
          // Component state survives a router refresh — only the day changing
          // remounts this board under a new key — so this picks up the current
          // questions without losing what's typed.
          router.refresh();
        } else {
          setStatus(result.reason);
        }
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

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  if (notes.length === 0) {
    return editable ? (
      <p className="w-fit rounded-md border-2 border-dashed border-[var(--ink-soft)] px-5 py-4 text-[15px]">
        No questions yet.{" "}
        <Link href="/questions" className="font-semibold underline underline-offset-2">
          Add some
        </Link>
        .
      </p>
    ) : (
      <p className="text-[15px] text-[var(--ink-soft)]">No check-in this day.</p>
    );
  }

  const board = (
    <div
      ref={boardRef}
      className="board"
      style={{ "--board-h": `${boardRows(notes.length) * ROW_REM}rem` } as CSSProperties}
    >
      {notes.map((note, index) => {
        const position = positionOf(note.id, index);
        const isSlapping = slapRound > 0 && (drafts[note.id] ?? "").trim().length > 0;
        return (
          <PostIt
            // A new key per save round restarts the slap animation.
            key={isSlapping ? `${note.id}-${slapRound}` : note.id}
            label={note.label}
            labelFor={editable ? `note-${note.id}` : undefined}
            color={noteColor(index)}
            tilt={cloudJitter(note.id).tilt}
            position={position}
            isSlapping={isSlapping}
            slapDelay={index * SLAP_STAGGER_S}
            isDragging={draggingId === note.id}
            handle={
              <button
                type="button"
                data-keys-local
                aria-label={`Move note: ${note.label}`}
                className="note-tape"
                onPointerDown={(event) => handlePointerDown(event, note.id, position)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={(event) => handleTapeKeyDown(event, note.id, position)}
                onBlur={() => handleTapeBlur(note.id)}
              />
            }
          >
            {editable ? (
              <textarea
                id={`note-${note.id}`}
                value={drafts[note.id] ?? ""}
                onChange={(event) => update(note.id, event.target.value)}
                onKeyDown={handleTextKeyDown}
                readOnly={isPending}
                maxLength={4096}
                rows={3}
                placeholder="…"
                className="mt-2 min-h-16 w-full flex-1 resize-none overflow-auto bg-transparent font-accent text-[22px] leading-tight outline-none field-sizing-content placeholder:text-[var(--ink-soft)] md:field-sizing-fixed"
              />
            ) : (
              <p className="mt-2 flex-1 overflow-auto whitespace-pre-wrap break-words font-accent text-[22px] leading-tight">
                {note.text}
              </p>
            )}
          </PostIt>
        );
      })}
    </div>
  );

  if (!editable) {
    return board;
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="checkin-heading" className="flex flex-col gap-5">
      {board}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--ink-soft)]">
          <span>⌘/Ctrl + Enter to stick</span>
          <span role="status">{STATUS_TEXT[status]}</span>
        </span>
        <button
          type="submit"
          disabled={isPending}
          className="pop h-10 cursor-pointer rounded-xl bg-[var(--brand)] px-4 font-heading text-[15px] text-[var(--surface)] transition-transform duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Sticking…" : "Stick it"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `src/components/day-sticker-picker.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setDayStickerAction } from "@/app/checkin-actions";
import { STICKER_NAMES, STICKERS } from "@/lib/sticker-list";
import type { Sticker } from "@/lib/sticker-list";
import { cn } from "@/lib/utils";

// Saves on tap; tapping the chosen sticker again clears it.
export function DayStickerPicker({ day, initial }: { day: string; initial: string | null }) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function pick(sticker: Sticker) {
    const previous = chosen;
    const next = sticker === chosen ? null : sticker;
    setChosen(next);
    startTransition(async () => {
      try {
        const result = await setDayStickerAction(day, next);
        if (!result.ok) {
          setChosen(previous);
          window.alert("This day has ended.");
          router.refresh();
        }
      } catch (error) {
        console.error("failed to set day sticker", error);
        setChosen(previous);
        window.alert("Couldn't save the sticker.");
      }
    });
  }

  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[var(--ink-soft)]">
        Today&apos;s sticker
      </legend>
      <div className="flex flex-wrap gap-2">
        {STICKERS.map((sticker) => (
          <button
            key={sticker}
            type="button"
            aria-pressed={sticker === chosen}
            aria-label={STICKER_NAMES[sticker]}
            disabled={isPending}
            onClick={() => pick(sticker)}
            className={cn(
              "flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-2xl transition-transform duration-150 hover:-rotate-6 hover:scale-110 disabled:cursor-wait",
              sticker === chosen ? "pop scale-110 bg-[var(--note-1)]" : "opacity-70 hover:opacity-100",
            )}
          >
            <span aria-hidden>{sticker}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If ESLint's React Compiler rules flag reading `positions` inside the async `save` callback, leave it: it reads the latest render's state, which is what we want.

- [ ] **Step 5: Commit**

```bash
git add src/components/post-it.tsx src/components/board.tsx src/components/day-sticker-picker.tsx
git commit -m "feat: check-in as post-its you write on, drag and stick"
```

---

### Task 15: Assemble the page

**Files:**
- Modify: `src/app/page.tsx` (full rewrite)
- Delete: `src/components/checkin-form.tsx`, `src/components/checkin-answers.tsx`

- [ ] **Step 1: Rewrite `src/app/page.tsx`**

```tsx
import type { ReactNode } from "react";

import { Board } from "@/components/board";
import type { BoardNote } from "@/components/board";
import { DayNavigation } from "@/components/day-navigation";
import { DayStickerPicker } from "@/components/day-sticker-picker";
import { Sky } from "@/components/sky";
import { TearOffCalendar } from "@/components/tear-off-calendar";
import { TimelineDock } from "@/components/timeline-dock";
import { isAdmin } from "@/lib/admin";
import { listActiveQuestions, listAnswersForDay, listDaysWithAnswers } from "@/lib/checkins";
import type { Answer, Question } from "@/lib/checkins";
import { formatDayHeading, monthRange, parseDay, today } from "@/lib/days";
import { listDaysWithMessages, listMessagesForDay } from "@/lib/messages";
import { listDayStickers } from "@/lib/stickers";
import { mindWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-[var(--ink-soft)]">{children}</p>;
}

// Check-ins are private: visitors get neither the answers nor anything that
// would reveal which days had one (dots, stamps, stickers).
async function loadDay(day: string, isOwner: boolean) {
  const { first, last } = monthRange(day);
  const [messages, messageDays, answerDays, answers, questions, stickers] = await Promise.all([
    listMessagesForDay(day),
    listDaysWithMessages(first, last),
    isOwner ? listDaysWithAnswers(first, last) : ([] as string[]),
    isOwner ? listAnswersForDay(day) : ([] as Answer[]),
    isOwner ? listActiveQuestions() : ([] as Question[]),
    isOwner ? listDayStickers(first, last) : ({} as Record<string, string>),
  ]);
  return { messages, messageDays, answerDays, answers, questions, stickers };
}

function savedPosition(answer: Answer | undefined) {
  return answer && answer.boardX !== null && answer.boardY !== null
    ? { x: answer.boardX, y: answer.boardY }
    : null;
}

// Today's notes are the active questions; a past day's are the answers it got,
// worded as they were then.
function boardNotes(isToday: boolean, questions: Question[], answers: Answer[]): BoardNote[] {
  if (!isToday) {
    return answers.map((answer) => ({
      id: answer.questionId,
      label: answer.questionText,
      text: answer.text,
      position: savedPosition(answer),
    }));
  }
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.map((question) => {
    const answer = byQuestion.get(question.id);
    return {
      id: question.id,
      label: question.text,
      text: answer?.text ?? "",
      position: savedPosition(answer),
    };
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const todayDay = today();
  // A missing or malformed ?day= just means today.
  const day = parseDay((await searchParams).day) ?? todayDay;
  const isToday = day === todayDay;
  const isOwner = await isAdmin();

  let data: Awaited<ReturnType<typeof loadDay>> | null = null;
  try {
    data = await loadDay(day, isOwner);
  } catch (error) {
    console.error("failed to load day", error);
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-[960px] px-6 py-10">
        <Notice>
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </Notice>
      </div>
    );
  }

  const weather = mindWeather(data.messages.length);
  const sticker = data.stickers[day] ?? null;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-4 pb-28 pt-8 sm:px-6 md:pb-12">
      <DayNavigation canCompose={isOwner} />

      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1 pt-2">
          <h1 id="day-heading" className="font-heading text-3xl sm:text-4xl">
            {formatDayHeading(day)}
          </h1>
          <p className="text-[15px] font-semibold text-[var(--ink-soft)]">
            <span aria-hidden>{weather.icon}</span> {weather.label}
          </p>
        </div>
        {/* Hidden, not unmounted, on phones: it owns the flip animation that
            keys and swipes trigger. */}
        <div className="hidden md:block">
          <TearOffCalendar
            day={day}
            today={todayDay}
            sticker={sticker}
            checkedIn={data.answers.length > 0}
            markedDays={[...data.messageDays, ...data.answerDays]}
          />
        </div>
      </div>

      <Sky messages={data.messages} canDelete={isOwner} weather={weather} />

      {isOwner && (
        <section aria-labelledby="checkin-heading" className="flex flex-col gap-6">
          <h2
            id="checkin-heading"
            className="font-heading text-lg uppercase tracking-wide text-[var(--ink-soft)]"
          >
            Check-in
          </h2>
          <Board
            key={day}
            day={day}
            editable={isToday}
            notes={boardNotes(isToday, data.questions, data.answers)}
          />
          {isToday && <DayStickerPicker key={day} day={day} initial={sticker} />}
        </section>
      )}

      <TimelineDock
        day={day}
        today={todayDay}
        messageDays={data.messageDays}
        checkinDays={data.answerDays}
        stickers={data.stickers}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old check-in components**

Run: `git rm src/components/checkin-form.tsx src/components/checkin-answers.tsx`

- [ ] **Step 3: Create `src/components/day-navigation.tsx`** (imported by the page above)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";

import { keyToAction, swipeToDelta } from "@/lib/day-keys";
import { emit, FLIP_DAY, OPEN_COMPOSER } from "@/lib/ui-events";

// Things that keep their own keys: text fields, and anything marked
// data-keys-local (a post-it's tape, which arrows nudge).
const OWNS_KEYS = "input, textarea, select, [contenteditable='true'], [data-keys-local]";
// Swipes that start here are someone else's: notes, the dock, the header.
const OWNS_TOUCH = `${OWNS_KEYS}, .note, nav, header`;

function within(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

// ←/→ flip days, t jumps to today, n opens the composer; on phones a sideways
// swipe flips. Flips go through the tear-off calendar so they animate.
export function DayNavigation({ canCompose }: { canCompose: boolean }) {
  const router = useRouter();

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const action = keyToAction(event.key, {
      modified: event.metaKey || event.ctrlKey || event.altKey,
      busy: within(event.target, OWNS_KEYS) || document.querySelector("dialog[open]") !== null,
    });
    if (action === null || (action.type === "compose" && !canCompose)) {
      return;
    }
    event.preventDefault();
    if (action.type === "shift") {
      emit(FLIP_DAY, { delta: action.delta });
    } else if (action.type === "today") {
      router.push("/");
    } else {
      emit(OPEN_COMPOSER);
    }
  });

  const onSwipe = useEffectEvent((delta: number) => {
    emit(FLIP_DAY, { delta });
  });

  useEffect(() => {
    let start: { x: number; y: number } | null = null;

    function handleKeyDown(event: KeyboardEvent) {
      onKey(event);
    }
    function handleTouchStart(event: TouchEvent) {
      start =
        event.touches.length === 1 && !within(event.target, OWNS_TOUCH)
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    }
    function handleTouchEnd(event: TouchEvent) {
      if (start === null) {
        return;
      }
      const touch = event.changedTouches[0];
      const delta = swipeToDelta(touch.clientX - start.x, touch.clientY - start.y);
      start = null;
      if (delta !== 0) {
        onSwipe(delta);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return null;
}
```

- [ ] **Step 4: Type-check, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no errors; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/page.tsx src/components/day-navigation.tsx src/components/checkin-form.tsx src/components/checkin-answers.tsx
git commit -m "feat: the sky and board page, with key and swipe flipping"
```

---

### Task 16: Composer as a cloud

**Files:**
- Modify: `src/components/compose-dialog.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the component**

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { PenLine } from "lucide-react";

import { createMessageAction } from "@/app/actions";
import { CloudShape } from "@/components/cloud-shape";
import { afterAnimation, OPEN_COMPOSER } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

const RISE_MS = 600;

// Lives in the header and opens a cloud-shaped modal; on save the cloud floats
// up into the sky. Also opens on the `n` key (via OPEN_COMPOSER).
export function ComposeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [isRising, setIsRising] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSave = text.trim().length > 0 && !isPending;

  function open() {
    dialogRef.current?.showModal();
    textareaRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    function handleOpen() {
      dialogRef.current?.showModal();
      textareaRef.current?.focus();
    }
    window.addEventListener(OPEN_COMPOSER, handleOpen);
    return () => window.removeEventListener(OPEN_COMPOSER, handleOpen);
  }, []);

  function save() {
    if (!canSave) {
      return;
    }
    startTransition(async () => {
      try {
        await createMessageAction(text);
        setIsRising(true);
        await afterAnimation(RISE_MS);
        setText("");
        close();
        setIsRising(false);
      } catch (error) {
        // Keep the draft: nothing typed should be lost to a failed save.
        console.error("failed to save entry", error);
        window.alert("Couldn't save the thought.");
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
    <>
      <button
        type="button"
        onClick={open}
        className="pop flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[var(--brand)] px-3 text-[13px] font-bold text-[var(--surface)] transition-transform duration-150 hover:-translate-y-0.5"
      >
        <PenLine className="h-4 w-4" strokeWidth={2.5} />
        <span className="hidden sm:inline">New thought</span>
        <span className="sr-only sm:hidden">New thought</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="compose-title"
        className="m-auto w-[min(560px,calc(100%-2rem))] overflow-visible bg-transparent p-0 text-[var(--ink)] backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <form
          onSubmit={handleSubmit}
          className={cn("cloud flex flex-col gap-3 px-8 pb-8 pt-14", isRising && "is-rising")}
        >
          <CloudShape />
          <h2 id="compose-title" className="font-heading text-xl">
            New thought
          </h2>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            placeholder="What's floating around up there?"
            aria-labelledby="compose-title"
            readOnly={isPending}
            maxLength={4096}
            className="w-full resize-y rounded-2xl bg-[var(--paper)] px-4 py-3 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--brand)]"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[12px] text-[var(--ink-soft)]">⌘/Ctrl + Enter to save</span>
            <button
              type="button"
              onClick={close}
              className="h-9 cursor-pointer rounded-lg px-3 text-[13px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--note-1)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="pop h-9 cursor-pointer rounded-lg bg-[var(--brand)] px-3 text-[13px] font-bold text-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Floating…" : "Let it float"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/compose-dialog.tsx
git commit -m "feat: compose a thought in a cloud that floats up on save"
```

---

### Task 17: Restyle the questions page

**Files:**
- Modify: `src/app/questions/page.tsx`
- Modify: `src/components/question-editor.tsx`

- [ ] **Step 1: Questions page heading**

In `src/app/questions/page.tsx`, replace:

```tsx
        <h1 className="font-heading text-2xl font-bold">Questions</h1>
```

with:

```tsx
        <h1 className="misprint font-heading text-3xl text-[var(--brand)]">Questions</h1>
```

- [ ] **Step 2: Editor styles**

In `src/components/question-editor.tsx`, replace the `PRIMARY_BUTTON` constant with:

```ts
const PRIMARY_BUTTON =
  "pop h-8 cursor-pointer rounded-md bg-[var(--brand)] px-3 text-[13px] font-semibold text-[var(--surface)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40";
```

and in `QuestionEditor`'s `<form>` replace:

```tsx
      className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-card px-3 py-2"
```

with:

```tsx
      className="pop flex items-center gap-1 rounded-xl px-3 py-2"
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/questions/page.tsx src/components/question-editor.tsx
git commit -m "style: questions page in the new look"
```

---

### Task 18: Docs

**Files:**
- Modify: `README.md` (sections "Writing and deleting from the page" and "Daily check-in")
- Modify (local only, never commit): `substack.md`

- [ ] **Step 1: README — writing**

In "Writing and deleting from the page", replace `it a **New entry** button appears in the header and a delete button on each
message.` with `it a **New thought** button appears in the header (or press `n`) and a delete button on each
cloud.` (keep the rest of the paragraph).

- [ ] **Step 2: README — replace the first paragraph of "Daily check-in"** with:

```markdown
Each day is a page: that day's thoughts float as clouds in a "sky", and, when
you're logged in as admin, its check-in sits below as post-its on a "board".
Move between days with the tear-off calendar (top right on desktop; ▦ opens the
month), the timeline dock at the bottom on phones, ←/→ or a sideways swipe.
`t` jumps to today. Today's post-its are blank notes you write on; "Stick it"
(or ⌘/Ctrl+Enter) saves them, and you can edit until midnight in
`DISPLAY_TIME_ZONE`, after which they're read-only. Blank answers are skipped.
Drag a note by its tape (desktop) to rearrange the board on any day. Pick one
sticker for today to mark the mood; it shows on the calendar and the dock.

The `calm · loud` switch in the header swaps the loud Riso Pop look for the
quieter Sage Morning one, which also goes dark when your system is in dark
mode.
```

In the second paragraph, change `Check-ins are private: visitors see the calendar and thoughts, but not
your answers or which days had a check-in.` to `Check-ins are private: visitors see the calendar and thoughts, but not
your answers, stickers, or which days had a check-in.`

- [ ] **Step 3: substack.md (local, do not stage)**

Change the Day 5 heading status from `🛠 planned` to `✅ built (not yet tested, deployed or posted)` and add under it:

```markdown
**Shipped:** Everything on the list in one day. The calendar is "hidden, not
unmounted" on phones because it owns the tear animation the keys and swipes
use. Post-its are a fixed size on desktop so they can be placed freely, and
grow with their text on phones. Two schema changes (note positions, day
stickers).
**Before going live:** Run `npm run db:init` against prod before deploying.
```

- [ ] **Step 4: Commit (README only)**

```bash
git add README.md
git commit -m "docs: the sky and board, calm/loud, stickers and shortcuts"
```

---

### Task 19: Verify end to end

- [ ] **Step 1: Automated checks**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; `next build` completes. Fix anything that fails before continuing.

- [ ] **Step 2: Upgrade the local database**

Run: `npm run db:init`
Expected: completes without error (new columns and `day_stickers` table).

- [ ] **Step 3: Run the app** (binding a port needs the sandbox off)

Run: `npm run dev`, open `http://localhost:3000`, log in via `/admin?key=<ADMIN_SECRET>`.

- [ ] **Step 4: Manual checklist** — tick each:
  - Loud: cream page, cobalt misprinted title, grain visible, black outlines on clouds, notes, buttons.
  - Switch to calm: sage, no outlines, no misprint. Reload: stays calm, no flash of loud.
  - Calm with macOS in dark mode: dark sage; loud ignores dark mode.
  - Clouds bob at different speeds; long thoughts make wider clouds; delete puffs the cloud away and it's gone after refresh.
  - Mind weather label and sky tint change with 0 / 2 / 5 / 9 thoughts.
  - Desktop: tear-off calendar top right; ‹ › tear and change day; ▦ opens the month; picking a day closes it.
  - ←/→ flip days, `t` goes to today, `n` opens the cloud composer; none fire while typing in a note or with the composer open.
  - Composer: saving floats the cloud up and the new cloud appears in the sky.
  - Today's post-its: write, "Stick it": notes slap in, status says "Stuck!", the calendar gets the CHECKED IN stamp.
  - Drag a note by its tape; refresh: it stays. Arrow keys on a focused tape nudge it, saved on blur. Past day: notes read-only but draggable.
  - Sticker: pick one → shows on the calendar; tap again → cleared.
  - Phone width (devtools, 390px): calendar hidden, dock at the bottom with dots/stickers, selected day centred; swipe on the sky flips days; notes in a two-column grid that grow with text.
  - Logged out (private window): clouds and calendar visible; no board, no stamp, no stickers, no check-in dots.
  - Reduced motion on (System Settings → Accessibility → Display): no bobbing, puff/tear/rise are instant.

- [ ] **Step 5: Commit any fixes** from the checklist, one small commit each, e.g.

```bash
git add <files>
git commit -m "fix: <what was wrong>"
```
