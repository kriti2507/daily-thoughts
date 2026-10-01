import { describe, expect, it } from "vitest";

import { boardNotes, boardRows, clamp01, defaultNotePosition, noteColor } from "@/lib/board";
import type { Answer, Question } from "@/lib/checkins";

describe("clamp01", () => {
  it("keeps values inside 0..1", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.7)).toBe(1);
  });
});

describe("noteColor", () => {
  it("cycles the four note colours", () => {
    expect(noteColor(0)).toBe("var(--note-1)");
    expect(noteColor(3)).toBe("var(--note-4)");
    expect(noteColor(5)).toBe("var(--note-2)");
  });
});

describe("boardRows", () => {
  it("fits four notes per row, at least one row", () => {
    expect(boardRows(0)).toBe(1);
    expect(boardRows(4)).toBe(1);
    expect(boardRows(5)).toBe(2);
  });
});

describe("defaultNotePosition", () => {
  it("lays notes left to right along the top row", () => {
    expect(defaultNotePosition(0, 3)).toEqual({ x: 0, y: 0 });
    expect(defaultNotePosition(2, 3)).toEqual({ x: 2 / 3, y: 0 });
    expect(defaultNotePosition(3, 4)).toEqual({ x: 1, y: 0 });
  });

  it("wraps to further rows spread top to bottom", () => {
    expect(defaultNotePosition(4, 6)).toEqual({ x: 0, y: 1 });
    expect(defaultNotePosition(4, 9)).toEqual({ x: 0, y: 0.5 });
  });
});

function question(id: number, text: string): Question {
  return { id, text, position: id, retiredAt: null };
}

function answer(questionId: number, overrides: Partial<Answer> = {}): Answer {
  return {
    questionId,
    questionText: `asked ${questionId}`,
    text: `answer ${questionId}`,
    boardX: null,
    boardY: null,
    ...overrides,
  };
}

describe("boardNotes", () => {
  it("today: one note per active question, in order, filled from saved answers", () => {
    const questions = [question(2, "How are you?"), question(1, "What did you learn?")];
    const answers = [answer(1, { text: "Vitest", boardX: 0.25, boardY: 0.75 })];
    expect(boardNotes(true, questions, answers)).toEqual([
      { id: 2, label: "How are you?", text: "", position: null },
      { id: 1, label: "What did you learn?", text: "Vitest", position: { x: 0.25, y: 0.75 } },
    ]);
  });

  it("past day: one note per answer, worded as the question was then", () => {
    // Question 1 has been reworded and question 3 retired since that day.
    const questions = [question(1, "Reworded question")];
    const answers = [
      answer(1, { questionText: "Original wording", text: "fine", boardX: 0, boardY: 1 }),
      answer(3, { questionText: "Retired question", text: "gone now" }),
    ];
    expect(boardNotes(false, questions, answers)).toEqual([
      { id: 1, label: "Original wording", text: "fine", position: { x: 0, y: 1 } },
      { id: 3, label: "Retired question", text: "gone now", position: null },
    ]);
  });

  it("has a position only when both coordinates are saved", () => {
    const answers = [
      answer(1, { boardX: 0.5, boardY: null }),
      answer(2, { boardX: null, boardY: 0.5 }),
      answer(3, { boardX: 0, boardY: 0 }),
    ];
    expect(boardNotes(false, [], answers).map((note) => note.position)).toEqual([
      null,
      null,
      { x: 0, y: 0 },
    ]);
  });
});
