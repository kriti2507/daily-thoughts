// A day is a calendar date in Japan time, passed around as a "YYYY-MM-DD"
// string. Strings rather than Dates, so a day can never be shifted by reading
// it in the server's own zone (UTC on Vercel).

// The one zone for everything: where a day ends, times shown on the page, and
// what the MCP server reports. A constant, so server, browser and Postgres
// (via `AT TIME ZONE`) always agree.
export const TIME_ZONE = "Asia/Tokyo";

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
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    date < 1 ||
    date > daysInMonth(year, month)
  ) {
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
