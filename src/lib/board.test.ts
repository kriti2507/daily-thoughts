import { describe, expect, it } from "vitest";

import { boardRows, clamp01, defaultNotePosition, noteColor } from "@/lib/board";

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
