import { getSql } from "@/lib/db";
import { TIME_ZONE } from "@/lib/days";

// What the calendars mark across a month: the days with thoughts, the days
// with a check-in, and each day's sticker.
export interface MonthMarks {
  messageDays: string[];
  answerDays: string[];
  stickers: Record<string, string>;
}

// One query rather than three, so the page spends one connection on it.
// Check-ins and stickers are private: visitors get only the days with
// thoughts. `to_char` so the driver hands back "YYYY-MM-DD" strings rather
// than Dates.
export async function listMonthMarks(from: string, to: string, isOwner: boolean): Promise<MonthMarks> {
  const sql = getSql();
  const ownerMarks = isOwner
    ? sql`
        UNION ALL
        SELECT DISTINCT 'answer', to_char(day, 'YYYY-MM-DD'), NULL::text
        FROM answers
        WHERE day BETWEEN ${from}::date AND ${to}::date
        UNION ALL
        SELECT 'sticker', to_char(day, 'YYYY-MM-DD'), sticker
        FROM day_stickers
        WHERE day BETWEEN ${from}::date AND ${to}::date
      `
    : sql``;
  const rows = await sql<{ kind: "message" | "answer" | "sticker"; day: string; sticker: string | null }[]>`
    SELECT DISTINCT 'message' AS kind,
      to_char((sent_at AT TIME ZONE ${TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
      NULL::text AS sticker
    FROM messages
    WHERE (sent_at AT TIME ZONE ${TIME_ZONE})::date BETWEEN ${from}::date AND ${to}::date
    ${ownerMarks}
  `;

  const marks: MonthMarks = { messageDays: [], answerDays: [], stickers: {} };
  for (const row of rows) {
    if (row.kind === "message") {
      marks.messageDays.push(row.day);
    } else if (row.kind === "answer") {
      marks.answerDays.push(row.day);
    } else if (row.sticker !== null) {
      marks.stickers[row.day] = row.sticker;
    }
  }
  return marks;
}
