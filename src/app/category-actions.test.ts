import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  after: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/categories", () => ({
  addCategory: vi.fn(),
  moveCategory: vi.fn(),
  retireCategory: vi.fn(),
  updateCategoryText: vi.fn(),
}));
vi.mock("@/lib/classifications", () => ({
  countPendingEntries: vi.fn(),
}));
vi.mock("@/lib/classify", () => ({
  classifyInBackground: vi.fn(),
  classifyPending: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  addCategoryAction,
  classifyNowAction,
  moveCategoryAction,
  retireCategoryAction,
  updateCategoryAction,
} from "@/app/category-actions";
import { isAdmin } from "@/lib/admin";
import { addCategory, moveCategory, retireCategory, updateCategoryText } from "@/lib/categories";
import { countPendingEntries } from "@/lib/classifications";
import { classifyInBackground, classifyPending } from "@/lib/classify";

afterEach(() => {
  vi.resetAllMocks();
});

describe("category actions", () => {
  it("each refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(addCategoryAction("Work")).rejects.toThrow("unauthorized");
    await expect(updateCategoryAction(1, "Work")).rejects.toThrow("unauthorized");
    await expect(moveCategoryAction(1, "up")).rejects.toThrow("unauthorized");
    await expect(retireCategoryAction(1)).rejects.toThrow("unauthorized");
    await expect(classifyNowAction()).rejects.toThrow("unauthorized");
    expect(addCategory).not.toHaveBeenCalled();
    expect(classifyPending).not.toHaveBeenCalled();
  });

  it("adds and rewords trimmed text, then classifies in the background", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await addCategoryAction("  Work \n");
    await updateCategoryAction(3, " Rest ");

    expect(addCategory).toHaveBeenCalledWith("Work");
    expect(updateCategoryText).toHaveBeenCalledWith(3, "Rest");
    expect(after).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledWith(classifyInBackground);
    expect(revalidatePath).toHaveBeenCalledWith("/questions");
  });

  it("refuses category text that is blank, too long, or not a string", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const text of ["", "  ", "x".repeat(61), 7 as unknown as string]) {
      await expect(addCategoryAction(text)).rejects.toThrow("invalid category");
    }
    expect(addCategory).not.toHaveBeenCalled();
  });

  it("moves and retires by id, refusing bad ids and directions", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await moveCategoryAction(2, "down");
    await retireCategoryAction(2);
    expect(moveCategory).toHaveBeenCalledWith(2, "down");
    expect(retireCategory).toHaveBeenCalledWith(2);

    await expect(retireCategoryAction(0)).rejects.toThrow("invalid category id");
    await expect(moveCategoryAction(2, "left" as "up")).rejects.toThrow("invalid direction");
  });

  it("classifies a batch on request and reports what's left", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(countPendingEntries).mockResolvedValue(12);

    await expect(classifyNowAction()).resolves.toEqual({ pending: 12 });
    expect(classifyPending).toHaveBeenCalledWith(50);
  });
});
