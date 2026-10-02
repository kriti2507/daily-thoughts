import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const systemOne = vi.fn();
vi.mock("@typesafe-ai/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@typesafe-ai/sdk")>()),
  TypeSafeClient: vi.fn(function () {
    return { systemOne };
  }),
}));
vi.mock("@/lib/categories", () => ({
  listActiveCategories: vi.fn(),
}));
vi.mock("@/lib/classifications", () => ({
  listPendingEntries: vi.fn(),
  saveClassifications: vi.fn(),
}));

import { listActiveCategories } from "@/lib/categories";
import type { Category } from "@/lib/categories";
import { listPendingEntries, saveClassifications } from "@/lib/classifications";
import type { Entry } from "@/lib/classifications";
import { buildRequest, classifyPending } from "@/lib/classify";

const checkedAt = new Date("2026-10-02T10:00:00Z");
const thought: Entry = { kind: "message", id: 7, text: "Deadline tomorrow, I'll never make it.", checkedAt };
const answer: Entry = {
  kind: "answer",
  id: 3,
  text: "My sister called.",
  prompt: "What did I handle well today?",
  checkedAt,
};
const categories: Category[] = [
  { id: 1, text: "Work", position: 1, retiredAt: null },
  { id: 2, text: "Catastrophising", position: 2, retiredAt: null },
];

describe("buildRequest", () => {
  it("asks one yes/no question per category, keyed by its id", () => {
    const { questions } = buildRequest(thought, categories);

    expect(Object.keys(questions)).toEqual(["category_1", "category_2"]);
    expect(questions.category_1.type).toBe("noul");
    expect(JSON.stringify(questions.category_1.instructions)).toContain("Work");
    expect(JSON.stringify(questions.category_2.instructions)).toContain("Catastrophising");
  });

  it("sends a thought on its own", () => {
    expect(buildRequest(thought, categories).state).toEqual({ entry: thought.text });
  });

  it("sends an answer with the question it answers", () => {
    expect(buildRequest(answer, categories).state).toEqual({
      prompt: "What did I handle well today?",
      entry: "My sister called.",
    });
  });
});

describe("classifyPending", () => {
  beforeEach(() => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.mocked(listActiveCategories).mockResolvedValue(categories);
    vi.mocked(listPendingEntries).mockResolvedValue([thought, answer]);
    systemOne.mockResolvedValue({
      answers: {
        category_1: { type: "noul", noul: 0.9 },
        category_2: { type: "noul", noul: 0.2 },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("stores every category's probability for every pending entry", async () => {
    await expect(classifyPending(10)).resolves.toBe(2);

    expect(listPendingEntries).toHaveBeenCalledWith(10);
    expect(saveClassifications).toHaveBeenCalledWith(thought, [
      { categoryId: 1, probability: 0.9 },
      { categoryId: 2, probability: 0.2 },
    ]);
    expect(saveClassifications).toHaveBeenCalledWith(answer, [
      { categoryId: 1, probability: 0.9 },
      { categoryId: 2, probability: 0.2 },
    ]);
  });

  it("keeps going when one entry fails, leaving it pending", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    systemOne.mockRejectedValueOnce(new Error("overloaded"));

    await expect(classifyPending(10)).resolves.toBe(1);
    expect(saveClassifications).toHaveBeenCalledTimes(1);
  });

  it("does nothing without an API key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");

    await expect(classifyPending(10)).resolves.toBe(0);
    expect(listPendingEntries).not.toHaveBeenCalled();
  });

  it("does nothing when there are no categories", async () => {
    vi.mocked(listActiveCategories).mockResolvedValue([]);

    await expect(classifyPending(10)).resolves.toBe(0);
    expect(systemOne).not.toHaveBeenCalled();
  });
});
