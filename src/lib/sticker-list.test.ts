import { describe, expect, it } from "vitest";

import { isSticker, STICKER_NAMES, STICKERS } from "@/lib/sticker-list";

describe("isSticker", () => {
  it("accepts every listed sticker", () => {
    for (const sticker of STICKERS) {
      expect(isSticker(sticker)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isSticker("x")).toBe(false);
    expect(isSticker("")).toBe(false);
    expect(isSticker(1)).toBe(false);
    expect(isSticker(null)).toBe(false);
  });
});

describe("STICKER_NAMES", () => {
  it("names every sticker", () => {
    for (const sticker of STICKERS) {
      expect(STICKER_NAMES[sticker]).toMatch(/\w/);
    }
  });
});
