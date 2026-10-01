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
