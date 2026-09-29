import { getSql } from "@/lib/db";

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

export async function listMessages(limit: number): Promise<Message[]> {
  const sql = getSql();
  const rows = await sql<
    { id: string; text: string; sent_at: Date; source: MessageSource }[]
  >`
    SELECT id, text, sent_at, source
    FROM messages
    ORDER BY sent_at DESC, id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    text: row.text,
    sentAt: row.sent_at,
    source: row.source,
  }));
}
