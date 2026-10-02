// Type-only: board.tsx (a client component) imports this file, and a value
// import would drag the DB client into the browser bundle.
import type { Answer, Question } from "@/lib/checkins";

// Positions on the board are fractions (0..1) of the space a note can move
// in, so they survive any screen width.
export const BOARD_COLUMNS = 4;

export interface NotePosition {
  x: number;
  y: number;
}

export interface BoardNote {
  id: number; // question id
  label: string;
  text: string;
  position: NotePosition | null;
  tags: string[];
}

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
export function defaultNotePosition(index: number, count: number): NotePosition {
  const rows = boardRows(count);
  const column = index % BOARD_COLUMNS;
  const row = Math.floor(index / BOARD_COLUMNS);
  return { x: column / (BOARD_COLUMNS - 1), y: rows > 1 ? row / (rows - 1) : 0 };
}

function savedPosition(answer: Answer | undefined): NotePosition | null {
  return answer && answer.boardX !== null && answer.boardY !== null
    ? { x: answer.boardX, y: answer.boardY }
    : null;
}

// Today's notes are the active questions; a past day's are the answers it got,
// worded as they were then. `tags` are the day's categories by question id.
export function boardNotes(
  isToday: boolean,
  questions: Question[],
  answers: Answer[],
  tags: Record<number, string[]> = {},
): BoardNote[] {
  if (!isToday) {
    return answers.map((answer) => ({
      id: answer.questionId,
      label: answer.questionText,
      text: answer.text,
      position: savedPosition(answer),
      tags: tags[answer.questionId] ?? [],
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
      tags: answer ? (tags[question.id] ?? []) : [],
    };
  });
}
