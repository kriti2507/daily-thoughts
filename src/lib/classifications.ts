import { getSql } from "@/lib/db";
import { TIME_ZONE } from "@/lib/days";

// Jev's probability is stored raw; this is where it becomes a yes. Changing it
// only changes what's shown, never what's stored.
export const MATCH_THRESHOLD = 0.5;

// A thought or a check-in answer, as handed to the classifier. `checkedAt` is
// the database's clock when the entry was read, and becomes `classified_at`.
export type Entry =
  | { kind: "message"; id: number; text: string; checkedAt: Date }
  | { kind: "answer"; id: number; text: string; prompt: string; checkedAt: Date };

export interface CategoryResult {
  categoryId: number;
  probability: number;
}

// Tags by message id and by question id, for one day.
export interface DayTags {
  messages: Record<number, string[]>;
  answers: Record<number, string[]>;
}

type Sql = ReturnType<typeof getSql>;

// An entry is pending when some active category has no result for it newer
// than both the category's wording and (for answers) the answer's text. New
// categories, rewordings, edits and earlier failures all land here.
function pendingEntries(sql: Sql) {
  return sql`
    SELECT 'message' AS kind, m.id, m.text, NULL AS prompt, m.sent_at AS written_at, now() AS checked_at
    FROM messages m
    WHERE EXISTS (
      SELECT 1 FROM categories c
      WHERE c.retired_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM classifications k
        WHERE k.message_id = m.id AND k.category_id = c.id
          AND k.classified_at >= c.updated_at
      )
    )
    UNION ALL
    SELECT 'answer' AS kind, a.id, a.text, a.question_text AS prompt, a.updated_at AS written_at,
      now() AS checked_at
    FROM answers a
    WHERE EXISTS (
      SELECT 1 FROM categories c
      WHERE c.retired_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM classifications k
        WHERE k.answer_id = a.id AND k.category_id = c.id
          AND k.classified_at >= GREATEST(c.updated_at, a.updated_at)
      )
    )
  `;
}

type PendingRow = {
  kind: "message" | "answer";
  id: string;
  text: string;
  prompt: string | null;
  checked_at: Date;
};

// Newest first, so a fresh entry isn't stuck behind a long backfill.
export async function listPendingEntries(limit: number): Promise<Entry[]> {
  const sql = getSql();
  const rows = await sql<PendingRow[]>`
    SELECT * FROM (${pendingEntries(sql)}) p
    ORDER BY p.written_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) =>
    row.kind === "message"
      ? { kind: "message", id: Number(row.id), text: row.text, checkedAt: row.checked_at }
      : {
          kind: "answer",
          id: Number(row.id),
          text: row.text,
          prompt: row.prompt ?? "",
          checkedAt: row.checked_at,
        },
  );
}

export async function countPendingEntries(): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*) AS count FROM (${pendingEntries(sql)}) p
  `;
  return Number(row.count);
}

export async function saveClassifications(entry: Entry, results: CategoryResult[]): Promise<void> {
  if (results.length === 0) {
    return;
  }
  const sql = getSql();
  const rows = results.map((result) => ({
    message_id: entry.kind === "message" ? entry.id : null,
    answer_id: entry.kind === "answer" ? entry.id : null,
    category_id: result.categoryId,
    probability: result.probability,
    classified_at: entry.checkedAt,
  }));
  const target = entry.kind === "message" ? sql`(message_id, category_id)` : sql`(answer_id, category_id)`;
  await sql`
    INSERT INTO classifications ${sql(rows, "message_id", "answer_id", "category_id", "probability", "classified_at")}
    ON CONFLICT ${target} DO UPDATE
      SET probability = EXCLUDED.probability,
          classified_at = EXCLUDED.classified_at
  `;
}

// Matching, up-to-date results only, in category order. A stale result is
// left out rather than shown under wording it wasn't judged against.
export async function listTagsForDay(day: string): Promise<DayTags> {
  const sql = getSql();
  const rows = await sql<{ kind: "message" | "answer"; key: string; text: string }[]>`
    SELECT 'message' AS kind, m.id AS key, c.text, c.position, c.id AS category_id
    FROM classifications k
    JOIN messages m ON m.id = k.message_id
    JOIN categories c ON c.id = k.category_id
    WHERE (m.sent_at AT TIME ZONE ${TIME_ZONE})::date = ${day}::date
      AND c.retired_at IS NULL
      AND k.classified_at >= c.updated_at
      AND k.probability >= ${MATCH_THRESHOLD}
    UNION ALL
    SELECT 'answer' AS kind, a.question_id AS key, c.text, c.position, c.id AS category_id
    FROM classifications k
    JOIN answers a ON a.id = k.answer_id
    JOIN categories c ON c.id = k.category_id
    WHERE a.day = ${day}::date
      AND c.retired_at IS NULL
      AND k.classified_at >= GREATEST(c.updated_at, a.updated_at)
      AND k.probability >= ${MATCH_THRESHOLD}
    ORDER BY position, category_id
  `;
  const tags: DayTags = { messages: {}, answers: {} };
  for (const row of rows) {
    const byKey = row.kind === "message" ? tags.messages : tags.answers;
    (byKey[Number(row.key)] ??= []).push(row.text);
  }
  return tags;
}
