import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  after: vi.fn(),
}));
vi.mock("@/lib/classify", () => ({
  classifyInBackground: vi.fn(),
}));
vi.mock("@/lib/checkins", () => ({
  addQuestion: vi.fn(),
  deleteAnswer: vi.fn(),
  listActiveQuestions: vi.fn(),
  moveQuestion: vi.fn(),
  retireQuestion: vi.fn(),
  setAnswerPosition: vi.fn(),
  updateQuestionText: vi.fn(),
  upsertAnswer: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/days", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/days")>()),
  today: vi.fn(),
}));
vi.mock("@/lib/stickers", () => ({
  clearDaySticker: vi.fn(),
  setDaySticker: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  addQuestionAction,
  moveNoteAction,
  moveQuestionAction,
  retireQuestionAction,
  saveCheckinAction,
  setDayStickerAction,
  updateQuestionAction,
} from "@/app/checkin-actions";
import { isAdmin } from "@/lib/admin";
import { classifyInBackground } from "@/lib/classify";
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
import { today } from "@/lib/days";
import { clearDaySticker, setDaySticker } from "@/lib/stickers";

const TODAY = "2026-09-30";

beforeEach(() => {
  vi.mocked(today).mockReturnValue(TODAY);
  vi.mocked(listActiveQuestions).mockResolvedValue([
    { id: 1, text: "First?", position: 1, retiredAt: null },
    { id: 2, text: "Second?", position: 2, retiredAt: null },
  ]);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("saveCheckinAction", () => {
  it("saves non-blank answers trimmed, deletes blank ones, and refreshes the page", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const result = await saveCheckinAction(TODAY, [
      { questionId: 1, text: "  felt fine\n" },
      { questionId: 2, text: "   " },
    ]);

    expect(result).toEqual({ ok: true });
    expect(upsertAnswer).toHaveBeenCalledWith(TODAY, 1, "felt fine");
    expect(deleteAnswer).toHaveBeenCalledWith(TODAY, 2);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(after).toHaveBeenCalledWith(classifyInBackground);
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(saveCheckinAction(TODAY, [{ questionId: 1, text: "x" }])).rejects.toThrow(
      "unauthorized",
    );
    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
    expect(listActiveQuestions).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a non-admin even for a past day (auth comes before the day check)", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(
      saveCheckinAction("2026-09-29", [{ questionId: 1, text: "x" }]),
    ).rejects.toThrow("unauthorized");
    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a day that is no longer today without writing anything", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const result = await saveCheckinAction("2026-09-29", [{ questionId: 1, text: "x" }]);

    expect(result).toEqual({ ok: false, reason: "day-ended" });
    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports questions that changed without writing anything, for an unknown or retired id", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const result = await saveCheckinAction(TODAY, [
      { questionId: 2, text: "valid" },
      { questionId: 3, text: "unknown or retired question" },
    ]);

    expect(result).toEqual({ ok: false, reason: "questions-changed" });
    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("writes nothing if any answer is invalid", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    const invalid = [
      { questionId: 0, text: "x" },
      { questionId: 1.5, text: "x" },
      { questionId: "1" as unknown as number, text: "x" },
      { questionId: 1, text: 7 as unknown as string },
      { questionId: 1, text: "x".repeat(4097) },
      null as unknown as { questionId: number; text: string },
    ];
    for (const answer of invalid) {
      await expect(
        saveCheckinAction(TODAY, [{ questionId: 2, text: "valid" }, answer]),
      ).rejects.toThrow("invalid answers");
    }
    await expect(
      saveCheckinAction(TODAY, "nope" as unknown as { questionId: number; text: string }[]),
    ).rejects.toThrow("invalid answers");

    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a duplicate question id without writing anything", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await expect(
      saveCheckinAction(TODAY, [
        { questionId: 1, text: "first" },
        { questionId: 1, text: "second" },
      ]),
    ).rejects.toThrow("invalid answers");

    expect(upsertAnswer).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts an answer at exactly the length limit", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await saveCheckinAction(TODAY, [{ questionId: 1, text: "x".repeat(4096) }]);

    expect(upsertAnswer).toHaveBeenCalledWith(TODAY, 1, "x".repeat(4096));
  });
});

describe("question actions", () => {
  it("each refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(addQuestionAction("Q?")).rejects.toThrow("unauthorized");
    await expect(updateQuestionAction(1, "Q?")).rejects.toThrow("unauthorized");
    await expect(moveQuestionAction(1, "up")).rejects.toThrow("unauthorized");
    await expect(retireQuestionAction(1)).rejects.toThrow("unauthorized");
    expect(addQuestion).not.toHaveBeenCalled();
    expect(updateQuestionText).not.toHaveBeenCalled();
    expect(moveQuestion).not.toHaveBeenCalled();
    expect(retireQuestion).not.toHaveBeenCalled();
  });

  it("adds a trimmed question and refreshes both pages", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await addQuestionAction("  What surprised me?\n");

    expect(addQuestion).toHaveBeenCalledWith("What surprised me?");
    expect(revalidatePath).toHaveBeenCalledWith("/questions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses question text that is blank, too long, or not a string", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const text of ["", "  \n", "x".repeat(501), 7 as unknown as string]) {
      await expect(addQuestionAction(text)).rejects.toThrow("invalid question");
      await expect(updateQuestionAction(1, text)).rejects.toThrow("invalid question");
    }
    expect(addQuestion).not.toHaveBeenCalled();
    expect(updateQuestionText).not.toHaveBeenCalled();
  });

  it("rewords, moves, and retires by id", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await updateQuestionAction(2, " Reworded? ");
    await moveQuestionAction(2, "down");
    await retireQuestionAction(2);

    expect(updateQuestionText).toHaveBeenCalledWith(2, "Reworded?");
    expect(moveQuestion).toHaveBeenCalledWith(2, "down");
    expect(retireQuestion).toHaveBeenCalledWith(2);
    expect(revalidatePath).toHaveBeenCalledWith("/questions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses ids that are not positive integers and unknown directions", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const id of [0, -1, 1.5, Number.NaN, "2" as unknown as number]) {
      await expect(updateQuestionAction(id, "Q?")).rejects.toThrow("invalid question id");
      await expect(moveQuestionAction(id, "up")).rejects.toThrow("invalid question id");
      await expect(retireQuestionAction(id)).rejects.toThrow("invalid question id");
    }
    await expect(moveQuestionAction(1, "sideways" as "up")).rejects.toThrow("invalid direction");
    expect(updateQuestionText).not.toHaveBeenCalled();
    expect(moveQuestion).not.toHaveBeenCalled();
    expect(retireQuestion).not.toHaveBeenCalled();
  });
});

describe("moveNoteAction", () => {
  it("saves a clamped position, on any day, and refreshes the page", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await moveNoteAction("2026-09-01", 1, 1.4, -0.2);

    expect(setAnswerPosition).toHaveBeenCalledWith("2026-09-01", 1, 1, 0);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(moveNoteAction(TODAY, 1, 0.5, 0.5)).rejects.toThrow("unauthorized");
    expect(setAnswerPosition).not.toHaveBeenCalled();
  });

  it("rejects a bad day, id or position", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await expect(moveNoteAction("yesterday", 1, 0.5, 0.5)).rejects.toThrow("invalid day");
    await expect(moveNoteAction(TODAY, 0, 0.5, 0.5)).rejects.toThrow("invalid question id");
    await expect(moveNoteAction(TODAY, 1, Number.NaN, 0.5)).rejects.toThrow("invalid position");
    await expect(
      moveNoteAction(TODAY, 1, 0.5, "0.5" as unknown as number),
    ).rejects.toThrow("invalid position");
    expect(setAnswerPosition).not.toHaveBeenCalled();
  });
});

describe("setDayStickerAction", () => {
  it("sets today's sticker and refreshes the page", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    expect(await setDayStickerAction(TODAY, "🔥")).toEqual({ ok: true });
    expect(setDaySticker).toHaveBeenCalledWith(TODAY, "🔥");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("clears today's sticker with null", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    expect(await setDayStickerAction(TODAY, null)).toEqual({ ok: true });
    expect(clearDaySticker).toHaveBeenCalledWith(TODAY);
    expect(setDaySticker).not.toHaveBeenCalled();
  });

  it("reports a day that has ended", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    expect(await setDayStickerAction("2026-09-29", "🔥")).toEqual({
      ok: false,
      reason: "day-ended",
    });
    expect(setDaySticker).not.toHaveBeenCalled();
    expect(clearDaySticker).not.toHaveBeenCalled();
  });

  it("rejects an unknown sticker", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await expect(setDayStickerAction(TODAY, "💩")).rejects.toThrow("invalid sticker");
    expect(setDaySticker).not.toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(setDayStickerAction(TODAY, "🔥")).rejects.toThrow("unauthorized");
    expect(setDaySticker).not.toHaveBeenCalled();
  });
});
