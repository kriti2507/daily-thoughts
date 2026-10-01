import { describe, expect, it } from "vitest";

import { keyToAction, SWIPE_MIN_PX, swipeToDelta } from "@/lib/day-keys";

const free = { modified: false, busy: false };

describe("keyToAction", () => {
  it("maps arrows, t and n", () => {
    expect(keyToAction("ArrowLeft", free)).toEqual({ type: "shift", delta: -1 });
    expect(keyToAction("ArrowRight", free)).toEqual({ type: "shift", delta: 1 });
    expect(keyToAction("t", free)).toEqual({ type: "today" });
    expect(keyToAction("n", free)).toEqual({ type: "compose" });
  });

  it("ignores other keys", () => {
    expect(keyToAction("x", free)).toBeNull();
    expect(keyToAction("ArrowUp", free)).toBeNull();
  });

  it("does nothing with a modifier held or while something else owns the keys", () => {
    expect(keyToAction("ArrowLeft", { modified: true, busy: false })).toBeNull();
    expect(keyToAction("n", { modified: false, busy: true })).toBeNull();
  });
});

describe("swipeToDelta", () => {
  it("swiping left goes forward a day, right goes back", () => {
    expect(swipeToDelta(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeToDelta(SWIPE_MIN_PX + 20, 10)).toBe(-1);
  });

  it("ignores short or mostly vertical swipes", () => {
    expect(swipeToDelta(SWIPE_MIN_PX - 1, 0)).toBe(0);
    expect(swipeToDelta(-80, 90)).toBe(0);
    expect(swipeToDelta(80, 80)).toBe(0);
  });
});
