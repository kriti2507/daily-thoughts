"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { isAdmin } from "@/lib/admin";
import { addCategory, moveCategory, retireCategory, updateCategoryText } from "@/lib/categories";
import { countPendingEntries } from "@/lib/classifications";
import { classifyInBackground, classifyPending } from "@/lib/classify";

// Short: a category shows as a tape on a cloud.
const MAX_CATEGORY_LENGTH = 60;
// Entries per click of "Classify now".
const BATCH_ON_REQUEST = 50;

// Server actions are public endpoints: anyone can call them with any argument,
// whether or not the page rendered a form for them. Hence every check below.
async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }
}

function requireId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("invalid category id");
  }
  return value;
}

function cleanCategoryText(text: unknown): string {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_CATEGORY_LENGTH) {
    throw new Error("invalid category");
  }
  return trimmed;
}

function refreshCategories(): void {
  revalidatePath("/questions");
  revalidatePath("/");
}

// A new or reworded category makes every entry pending against it.
export async function addCategoryAction(text: string): Promise<void> {
  await requireAdmin();
  await addCategory(cleanCategoryText(text));
  refreshCategories();
  after(classifyInBackground);
}

export async function updateCategoryAction(id: number, text: string): Promise<void> {
  await requireAdmin();
  await updateCategoryText(requireId(id), cleanCategoryText(text));
  refreshCategories();
  after(classifyInBackground);
}

export async function moveCategoryAction(id: number, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const categoryId = requireId(id);
  if (direction !== "up" && direction !== "down") {
    throw new Error("invalid direction");
  }
  await moveCategory(categoryId, direction);
  refreshCategories();
}

export async function retireCategoryAction(id: number): Promise<void> {
  await requireAdmin();
  await retireCategory(requireId(id));
  refreshCategories();
}

// Waits for the batch, unlike the background runs, so the page can show how
// many entries are still left.
export async function classifyNowAction(): Promise<{ pending: number }> {
  await requireAdmin();
  await classifyPending(BATCH_ON_REQUEST);
  refreshCategories();
  return { pending: await countPendingEntries() };
}
