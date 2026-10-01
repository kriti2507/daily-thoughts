import { describe, expect, it } from "vitest";

import { cloudJitter, cloudSize, seeded } from "@/lib/clouds";

describe("cloudSize", () => {
  it("buckets by length at 60 and 240 characters", () => {
    expect(cloudSize("")).toBe("s");
    expect(cloudSize("a".repeat(60))).toBe("s");
    expect(cloudSize("a".repeat(61))).toBe("m");
    expect(cloudSize("a".repeat(240))).toBe("m");
    expect(cloudSize("a".repeat(241))).toBe("l");
    expect(cloudSize("a".repeat(4096))).toBe("l");
  });
});

describe("seeded", () => {
  it("is deterministic and in [0, 1)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const value = seeded(seed, 0);
      expect(value).toBe(seeded(seed, 0));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("differs by salt", () => {
    expect(seeded(7, 0)).not.toBe(seeded(7, 1));
  });
});

describe("cloudJitter", () => {
  it("stays in range for many ids", () => {
    for (let id = 1; id <= 500; id++) {
      const { tilt, offsetY, bobSeconds, bobDelay } = cloudJitter(id);
      expect(tilt).toBeGreaterThanOrEqual(-3);
      expect(tilt).toBeLessThanOrEqual(3);
      expect(offsetY).toBeGreaterThanOrEqual(0);
      expect(offsetY).toBeLessThanOrEqual(16);
      expect(bobSeconds).toBeGreaterThanOrEqual(4);
      expect(bobSeconds).toBeLessThanOrEqual(7);
      expect(bobDelay).toBeGreaterThanOrEqual(0);
      expect(bobDelay).toBeLessThanOrEqual(3);
    }
  });

  it("is the same on every call, so server and client agree", () => {
    expect(cloudJitter(42)).toEqual(cloudJitter(42));
  });
});
