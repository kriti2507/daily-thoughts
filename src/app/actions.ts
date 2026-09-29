"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import { deleteMessage, insertWebMessage } from "@/lib/messages";

// Telegram's own cap, so an entry is the same size whichever way it arrives.
const MAX_MESSAGE_LENGTH = 4096;

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

export async function createMessageAction(text: string): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error("invalid message");
  }

  await insertWebMessage(trimmed);
  revalidatePath("/");
}
