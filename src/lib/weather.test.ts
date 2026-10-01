import { describe, expect, it } from "vitest";

import { mindWeather } from "@/lib/weather";

describe("mindWeather", () => {
  it("is clear with no thoughts", () => {
    expect(mindWeather(0)).toEqual({ kind: "clear", icon: "☀️", label: "Clear skies" });
  });

  it("steps through fair, cloudy and stormy at 1, 4 and 8 thoughts", () => {
    expect(mindWeather(1).kind).toBe("fair");
    expect(mindWeather(3).kind).toBe("fair");
    expect(mindWeather(4).kind).toBe("cloudy");
    expect(mindWeather(7).kind).toBe("cloudy");
    expect(mindWeather(8).kind).toBe("stormy");
    expect(mindWeather(50).kind).toBe("stormy");
  });

  it("labels every kind", () => {
    expect(mindWeather(2).label).toBe("Fair, a few clouds");
    expect(mindWeather(5).label).toBe("Cloudy mind");
    expect(mindWeather(9).label).toBe("Stormy mind");
  });
});
