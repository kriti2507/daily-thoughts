import { describe, expect, it } from "vitest";

import { buildDays } from "@/lib/mcp/journal";

describe("buildDays", () => {
  it("groups thoughts, check-ins, stickers and tags by day, oldest first", () => {
    const days = buildDays(
      [
        { id: "1", day: "2026-10-02", time: "09:15", source: "telegram", text: "coffee" },
        { id: "2", day: "2026-10-01", time: "22:00", source: "web", text: "tired" },
      ],
      [{ id: "7", day: "2026-10-02", question_id: "3", question_text: "What went well?", text: "the run" }],
      [{ day: "2026-10-03", sticker: "🌧" }],
      [
        { kind: "message", id: "1", text: "Work" },
        { kind: "message", id: "1", text: "Gratitude and wins" },
        { kind: "answer", id: "7", text: "Health and body" },
        // Answer id 1 is not message id 1.
        { kind: "answer", id: "1", text: "Self-doubt" },
      ],
    );

    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(days[0].thoughts).toEqual([
      { id: 2, time: "22:00", source: "web", text: "tired", categories: [] },
    ]);
    expect(days[1].thoughts[0].categories).toEqual(["Work", "Gratitude and wins"]);
    expect(days[1].check_in).toEqual([
      { question_id: 3, question: "What went well?", answer: "the run", categories: ["Health and body"] },
    ]);
    expect(days[2]).toEqual({
      day: "2026-10-03",
      sticker: { emoji: "🌧", meaning: "rainy" },
      thoughts: [],
      check_in: [],
    });
  });
});
