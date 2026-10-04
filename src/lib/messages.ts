import { getSql } from "@/lib/db";
import { TIME_ZONE } from "@/lib/days";

export type MessageSource = "telegram" | "web";

export interface Message {
  id: number;
  text: string;
  sentAt: Date;
  source: MessageSource;
}

export interface NewMessage {
  telegramId: number;
  chatId: number;
  text: string;
  sentAt: Date;
}

export async function insertMessage(message: NewMessage): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO messages (source, telegram_id, chat_id, text, sent_at)
    VALUES ('telegram', ${message.telegramId}, ${message.chatId}, ${message.text}, ${message.sentAt})
    ON CONFLICT (chat_id, telegram_id) DO NOTHING
  `;
}

export async function insertWebMessage(text: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO messages (source, text, sent_at)
    VALUES ('web', ${text}, now())
  `;
}

export async function deleteMessage(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM messages WHERE id = ${id}`;
}

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
