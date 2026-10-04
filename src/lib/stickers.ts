import { getSql } from "@/lib/db";
import type { Sticker } from "@/lib/sticker-list";

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
