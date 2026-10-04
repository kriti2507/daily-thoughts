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
  // Board position as fractions; null until the note is first moved.
  boardX: number | null;
  boardY: number | null;
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
