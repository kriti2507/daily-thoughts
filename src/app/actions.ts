"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import { deleteMessage } from "@/lib/messages";

// Server actions are public endpoints: anyone can call this with any argument,
// whether or not the page rendered a delete button for them. Hence both checks.
export async function deleteMessageAction(id: number): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("invalid message id");
  }

  await deleteMessage(id);
  revalidatePath("/");
}
