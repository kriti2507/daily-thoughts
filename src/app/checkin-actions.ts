"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { isAdmin } from "@/lib/admin";
import { clamp01 } from "@/lib/board";
import {
  addQuestion,
  deleteAnswer,
  listActiveQuestions,
  moveQuestion,
  retireQuestion,
  setAnswerPosition,
  updateQuestionText,
  upsertAnswer,
} from "@/lib/checkins";
import { classifyInBackground } from "@/lib/classify";
import { parseDay, today } from "@/lib/days";
import { isSticker } from "@/lib/sticker-list";
import { clearDaySticker, setDaySticker } from "@/lib/stickers";

// Same cap as a thought, so nothing written here is bigger than an entry.
const MAX_ANSWER_LENGTH = 4096;
const MAX_QUESTION_LENGTH = 500;

export interface AnswerInput {
  questionId: number;
  text: string;
}

// Returned rather than thrown: Next.js hides thrown messages from the client in
// production, and the form needs to tell "the day ended" (the day rolled over
// under the writer) and "the questions changed" (a question was retired since
// the page loaded) apart from any other failure.
export type SaveCheckinResult =
  | { ok: true }
  | { ok: false; reason: "day-ended" | "questions-changed" };

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

  // Validate shape before writing anything, so a bad answer can't leave a
  // half-saved check-in. Membership in the active set is checked separately,
  // below, since that's not malformed input but a race with an edit elsewhere.
  const seenIds = new Set<number>();
  for (const answer of answers) {
    if (
      typeof answer !== "object" ||
      answer === null ||
      !isId(answer.questionId) ||
      typeof answer.text !== "string" ||
      answer.text.trim().length > MAX_ANSWER_LENGTH ||
      seenIds.has(answer.questionId)
    ) {
      throw new Error("invalid answers");
    }
    seenIds.add(answer.questionId);
  }

  // Checked only once every answer's shape is known good, so a question
  // retired after the page loaded is reported rather than thrown.
  const activeIds = new Set((await listActiveQuestions()).map((question) => question.id));
  if (answers.some((answer) => !activeIds.has(answer.questionId))) {
    return { ok: false, reason: "questions-changed" };
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
  after(classifyInBackground);
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Any day, not just today: moving a note changes the board, not the answer.
export async function moveNoteAction(
  day: string,
  questionId: number,
  x: number,
  y: number,
): Promise<void> {
  await requireAdmin();
  const validDay = parseDay(day);
  if (validDay === null) {
    throw new Error("invalid day");
  }
  const id = requireId(questionId);
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    throw new Error("invalid position");
  }
  await setAnswerPosition(validDay, id, clamp01(x), clamp01(y));
  revalidatePath("/");
}

export type SetStickerResult = { ok: true } | { ok: false; reason: "day-ended" };

// Today only, like the check-in it belongs to. `null` clears it.
export async function setDayStickerAction(
  day: string,
  sticker: string | null,
): Promise<SetStickerResult> {
  await requireAdmin();
  if (sticker !== null && !isSticker(sticker)) {
    throw new Error("invalid sticker");
  }
  if (day !== today()) {
    return { ok: false, reason: "day-ended" };
  }
  if (sticker === null) {
    await clearDaySticker(day);
  } else {
    await setDaySticker(day, sticker);
  }
  revalidatePath("/");
  return { ok: true };
}
