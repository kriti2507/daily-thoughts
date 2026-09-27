import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/messages", () => ({
  deleteMessage: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { deleteMessageAction } from "@/app/actions";
import { isAdmin } from "@/lib/admin";
import { deleteMessage } from "@/lib/messages";

afterEach(() => {
  vi.mocked(isAdmin).mockReset();
  vi.mocked(deleteMessage).mockClear();
  vi.mocked(revalidatePath).mockClear();
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
