"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import {
  addQuestion,
  deleteAnswer,
  listActiveQuestions,
  moveQuestion,
  retireQuestion,
  updateQuestionText,
  upsertAnswer,
} from "@/lib/checkins";
import { today } from "@/lib/days";

// Same cap as a thought, so nothing written here is bigger than an entry.
const MAX_ANSWER_LENGTH = 4096;
const MAX_QUESTION_LENGTH = 500;

export interface AnswerInput {
  questionId: number;
  text: string;
}

// Returned rather than thrown: Next.js hides thrown messages from the client in
// production, and the form needs to tell "the day ended" apart from a failure.
export type SaveCheckinResult = { ok: true } | { ok: false; reason: "day-ended" };

// Server actions are public endpoints: anyone can call them with any argument,
// whether or not the page rendered a form for them. Hence every check below.
async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requireId(value: unknown): number {
  if (!isId(value)) {
    throw new Error("invalid question id");
  }
  return value;
}

function cleanQuestionText(text: unknown): string {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_LENGTH) {
    throw new Error("invalid question");
  }
  return trimmed;
}

function refreshQuestions(): void {
  revalidatePath("/questions");
  revalidatePath("/");
}

// Only today can be written. The day is checked against the server's clock, so
// a crafted request can't write to the past and a form left open past midnight
// can't save into the wrong day.
export async function saveCheckinAction(
  day: string,
  answers: AnswerInput[],
): Promise<SaveCheckinResult> {
  await requireAdmin();
  if (day !== today()) {
    return { ok: false, reason: "day-ended" };
  }
  if (!Array.isArray(answers)) {
    throw new Error("invalid answers");
  }

  const activeIds = new Set((await listActiveQuestions()).map((question) => question.id));
  // Validate everything before writing anything, so a bad answer can't leave
  // a half-saved check-in.
  for (const answer of answers) {
    if (
      typeof answer !== "object" ||
      answer === null ||
      !isId(answer.questionId) ||
      !activeIds.has(answer.questionId) ||
      typeof answer.text !== "string" ||
      answer.text.trim().length > MAX_ANSWER_LENGTH
    ) {
      throw new Error("invalid answers");
    }
  }

  for (const { questionId, text } of answers) {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      await upsertAnswer(day, questionId, trimmed);
    } else {
      await deleteAnswer(day, questionId);
    }
  }
  revalidatePath("/");
  return { ok: true };
}

export async function addQuestionAction(text: string): Promise<void> {
  await requireAdmin();
  await addQuestion(cleanQuestionText(text));
  refreshQuestions();
}

export async function updateQuestionAction(id: number, text: string): Promise<void> {
  await requireAdmin();
  await updateQuestionText(requireId(id), cleanQuestionText(text));
  refreshQuestions();
}

export async function moveQuestionAction(id: number, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const questionId = requireId(id);
  if (direction !== "up" && direction !== "down") {
    throw new Error("invalid direction");
  }
  await moveQuestion(questionId, direction);
  refreshQuestions();
}

export async function retireQuestionAction(id: number): Promise<void> {
  await requireAdmin();
  await retireQuestion(requireId(id));
  refreshQuestions();
}
