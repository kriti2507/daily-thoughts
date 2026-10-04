import type { PendingQuery, Row } from "postgres";

import { getSql } from "@/lib/db";
import { MATCH_THRESHOLD } from "@/lib/classifications";
import { TIME_ZONE } from "@/lib/days";
import { STICKER_NAMES, isSticker } from "@/lib/sticker-list";

// Everything the MCP `get_data` tool returns, grouped by day so a model can
// read it like the journal it is.

export interface Thought {
  id: number;
  time: string; // HH:MM in the display time zone
  source: "telegram" | "web";
  text: string;
  categories: string[];
}

export interface CheckInAnswer {
  question_id: number;
  question: string; // the wording as it was when answered
  answer: string;
  categories: string[];
}

export interface Day {
  day: string;
  sticker: { emoji: string; meaning: string } | null;
  thoughts: Thought[];
  check_in: CheckInAnswer[];
}

export interface Journal {
  time_zone: string;
  questions: { id: number; text: string; position: number; retired: boolean }[];
  categories: string[];
  days: Day[];
}

type MessageRow = { id: string; day: string; time: string; source: Thought["source"]; text: string };
type AnswerRow = { id: string; day: string; question_id: string; question_text: string; text: string };
type StickerRow = { day: string; sticker: string };
type TagRow = { kind: "message" | "answer"; id: string; text: string };

export function buildDays(
  messages: MessageRow[],
  answers: AnswerRow[],
  stickers: StickerRow[],
  tags: TagRow[],
): Day[] {
  const tagsFor = new Map<string, string[]>();
  for (const tag of tags) {
    const key = `${tag.kind}:${tag.id}`;
    tagsFor.set(key, [...(tagsFor.get(key) ?? []), tag.text]);
  }

  const days = new Map<string, Day>();
  const dayFor = (day: string): Day => {
    let entry = days.get(day);
    if (!entry) {
      entry = { day, sticker: null, thoughts: [], check_in: [] };
      days.set(day, entry);
    }
    return entry;
  };

  for (const m of messages) {
    dayFor(m.day).thoughts.push({
      id: Number(m.id),
      time: m.time,
      source: m.source,
      text: m.text,
      categories: tagsFor.get(`message:${m.id}`) ?? [],
    });
  }
  for (const a of answers) {
    dayFor(a.day).check_in.push({
      question_id: Number(a.question_id),
      question: a.question_text,
      answer: a.text,
      categories: tagsFor.get(`answer:${a.id}`) ?? [],
    });
  }
  for (const s of stickers) {
    dayFor(s.day).sticker = {
      emoji: s.sticker,
      meaning: isSticker(s.sticker) ? STICKER_NAMES[s.sticker] : s.sticker,
    };
  }

  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Inclusive range of "YYYY-MM-DD" days; either end may be open. */
export async function loadJournal(from: string | null, to: string | null): Promise<Journal> {
  const sql = getSql();
  const messageDay = sql`(m.sent_at AT TIME ZONE ${TIME_ZONE})::date`;
  const inRange = (day: PendingQuery<Row[]>) =>
    sql`${from ? sql`${day} >= ${from}::date` : sql`TRUE`} AND ${to ? sql`${day} <= ${to}::date` : sql`TRUE`}`;

  const [messages, answers, stickers, tags, questions, categories] = await Promise.all([
    sql<MessageRow[]>`
      SELECT m.id, to_char(${messageDay}, 'YYYY-MM-DD') AS day,
        to_char(m.sent_at AT TIME ZONE ${TIME_ZONE}, 'HH24:MI') AS time, m.source, m.text
      FROM messages m
      WHERE ${inRange(messageDay)}
      ORDER BY m.sent_at, m.id
    `,
    sql<AnswerRow[]>`
      SELECT a.id, to_char(a.day, 'YYYY-MM-DD') AS day, a.question_id, a.question_text, a.text
      FROM answers a
      JOIN questions q ON q.id = a.question_id
      WHERE ${inRange(sql`a.day`)}
      ORDER BY a.day, q.position, q.id
    `,
    sql<StickerRow[]>`
      SELECT to_char(s.day, 'YYYY-MM-DD') AS day, s.sticker
      FROM day_stickers s
      WHERE ${inRange(sql`s.day`)}
    `,
    // Matching, up-to-date results only, as on the page (see listTagsForDay).
    sql<TagRow[]>`
      SELECT 'message' AS kind, m.id, c.text, c.position, c.id AS category_id
      FROM classifications k
      JOIN messages m ON m.id = k.message_id
      JOIN categories c ON c.id = k.category_id
      WHERE ${inRange(messageDay)}
        AND c.retired_at IS NULL
        AND k.classified_at >= c.updated_at
        AND k.probability >= ${MATCH_THRESHOLD}
      UNION ALL
      SELECT 'answer' AS kind, a.id, c.text, c.position, c.id AS category_id
      FROM classifications k
      JOIN answers a ON a.id = k.answer_id
      JOIN categories c ON c.id = k.category_id
      WHERE ${inRange(sql`a.day`)}
        AND c.retired_at IS NULL
        AND k.classified_at >= GREATEST(c.updated_at, a.updated_at)
        AND k.probability >= ${MATCH_THRESHOLD}
      ORDER BY position, category_id
    `,
    sql<{ id: string; text: string; position: number; retired: boolean }[]>`
      SELECT id, text, position, retired_at IS NOT NULL AS retired
      FROM questions
      ORDER BY retired_at IS NOT NULL, position, id
    `,
    sql<{ text: string }[]>`
      SELECT text FROM categories WHERE retired_at IS NULL ORDER BY position, id
    `,
  ]);

  return {
    time_zone: TIME_ZONE,
    questions: questions.map((q) => ({ ...q, id: Number(q.id) })),
    categories: categories.map((c) => c.text),
    days: buildDays(messages, answers, stickers, tags),
  };
}
