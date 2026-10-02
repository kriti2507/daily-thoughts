import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import type { NoulQuestion } from "@typesafe-ai/sdk";

import { listActiveCategories } from "@/lib/categories";
import type { Category } from "@/lib/categories";
import { listPendingEntries, saveClassifications } from "@/lib/classifications";
import type { Entry } from "@/lib/classifications";

// Entries classified per run of `after()`: small enough to finish well inside a
// serverless function's time limit, and the rest wait for the next run.
export const BATCH_AFTER_SAVE = 20;
// Jev requests in flight at once.
const CONCURRENCY = 4;

export function isClassifierConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

// One Noul per category, because an entry can fit several at once. They all
// go in one request, where Jev answers them in parallel.
export function buildRequest(
  entry: Entry,
  categories: Category[],
): { state: Record<string, string>; questions: Record<string, NoulQuestion> } {
  const subject =
    entry.kind === "answer"
      ? "`entry` is a journal answer to the check-in question `prompt`. Is the answer"
      : "Is the journal entry `entry`";
  const questions: Record<string, NoulQuestion> = {};
  for (const category of categories) {
    questions[`category_${category.id}`] = noul(
      `${subject} about, or does it show, "${category.text}"?`,
      {
        true: `The writer's words are about "${category.text}", or clearly show it.`,
        false: `"${category.text}" is absent, or would be a stretch.`,
      },
    );
  }
  const state =
    entry.kind === "answer" ? { prompt: entry.prompt, entry: entry.text } : { entry: entry.text };
  return { state, questions };
}

async function classifyEntry(client: TypeSafeClient, entry: Entry, categories: Category[]) {
  const { answers } = await client.systemOne(buildRequest(entry, categories));
  await saveClassifications(
    entry,
    categories.map((category) => ({
      categoryId: category.id,
      probability: answers[`category_${category.id}`].noul,
    })),
  );
}

// Classifies up to `limit` pending entries and returns how many it stored.
// Never throws for a single entry: a failure is logged and the entry stays
// pending, to be picked up by a later run.
export async function classifyPending(limit: number): Promise<number> {
  if (!isClassifierConfigured()) {
    return 0;
  }
  const categories = await listActiveCategories();
  if (categories.length === 0) {
    return 0;
  }
  const entries = await listPendingEntries(limit);
  const client = new TypeSafeClient();

  let stored = 0;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(
      entries.slice(i, i + CONCURRENCY).map((entry) => classifyEntry(client, entry, categories)),
    );
    for (const [j, result] of results.entries()) {
      if (result.status === "fulfilled") {
        stored += 1;
      } else {
        const entry = entries[i + j];
        console.error(`failed to classify ${entry.kind} ${entry.id}`, result.reason);
      }
    }
  }
  return stored;
}

// For `after()`: a failure here must never surface to the request that
// triggered it.
export async function classifyInBackground(): Promise<void> {
  try {
    await classifyPending(BATCH_AFTER_SAVE);
  } catch (error) {
    console.error("background classification failed", error);
  }
}
