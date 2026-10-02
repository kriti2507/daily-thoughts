import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  after: vi.fn(),
}));
vi.mock("@/lib/classify", () => ({
  classifyInBackground: vi.fn(),
}));
vi.mock("@/lib/messages", () => ({
  deleteMessage: vi.fn(),
  insertWebMessage: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createMessageAction, deleteMessageAction } from "@/app/actions";
import { isAdmin } from "@/lib/admin";
import { classifyInBackground } from "@/lib/classify";
import { deleteMessage, insertWebMessage } from "@/lib/messages";

afterEach(() => {
  vi.mocked(isAdmin).mockReset();
  vi.mocked(deleteMessage).mockClear();
  vi.mocked(insertWebMessage).mockClear();
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(after).mockClear();
});

describe("deleteMessageAction", () => {
  it("deletes the message and refreshes the page for an admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await deleteMessageAction(7);

    expect(deleteMessage).toHaveBeenCalledWith(7);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(deleteMessageAction(7)).rejects.toThrow("unauthorized");
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a positive integer", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const id of [0, -1, 1.5, Number.NaN, "7" as unknown as number]) {
      await expect(deleteMessageAction(id)).rejects.toThrow("invalid message id");
    }
    expect(deleteMessage).not.toHaveBeenCalled();
  });
});

describe("createMessageAction", () => {
  it("stores the trimmed text and refreshes the page for an admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await createMessageAction("  a thought\n");

    expect(insertWebMessage).toHaveBeenCalledWith("a thought");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(after).toHaveBeenCalledWith(classifyInBackground);
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(createMessageAction("a thought")).rejects.toThrow("unauthorized");
    expect(insertWebMessage).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("refuses text that is empty, blank, too long, or not a string", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const text of ["", "   \n", "x".repeat(4097), 7 as unknown as string]) {
      await expect(createMessageAction(text)).rejects.toThrow("invalid message");
    }
    expect(insertWebMessage).not.toHaveBeenCalled();
  });

  it("accepts text at exactly the length limit", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await createMessageAction("x".repeat(4096));

    expect(insertWebMessage).toHaveBeenCalledWith("x".repeat(4096));
  });
});
