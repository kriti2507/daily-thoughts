import { describe, expect, it } from "vitest";

import {
  dayInZone,
  formatDayHeading,
  formatMonthLabel,
  monthGrid,
  monthRange,
  parseDay,
  shiftMonth,
} from "@/lib/days";

describe("dayInZone", () => {
  it("uses the zone's date, not UTC's", () => {
    // 23:30 in Tokyo is still the 30th there.
    expect(dayInZone(new Date("2026-09-30T14:30:00Z"), "Asia/Tokyo")).toBe("2026-09-30");
    // 00:30 the next morning in Tokyo.
    expect(dayInZone(new Date("2026-09-30T15:30:00Z"), "Asia/Tokyo")).toBe("2026-10-01");
    // 20:00 in Los Angeles is still the 30th there, though UTC is on the 1st.
    expect(dayInZone(new Date("2026-10-01T03:00:00Z"), "America/Los_Angeles")).toBe(
      "2026-09-30",
    );
  });
});

describe("parseDay", () => {
  it("accepts real calendar dates", () => {
    expect(parseDay("2026-09-30")).toBe("2026-09-30");
    expect(parseDay("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects impossible dates and anything not YYYY-MM-DD", () => {
    for (const value of [
      "2026-02-29",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "2026-09-00",
      "2026-9-30",
      "2026-09-30T00:00",
      "",
      undefined,
      ["2026-09-30"],
      20260930,
    ]) {
      expect(parseDay(value)).toBeNull();
    }
  });
});

describe("monthRange", () => {
  it("spans the first to the last day of the month", () => {
    expect(monthRange("2026-02-14")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthRange("2028-02-03")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthRange("2026-12-31")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });
});

describe("shiftMonth", () => {
  it("keeps the day number when the target month has it", () => {
    expect(shiftMonth("2026-09-15", 1)).toBe("2026-10-15");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("clamps to the target month's last day", () => {
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("monthGrid", () => {
  it("lays the month out in Monday-first weeks padded with nulls", () => {
    // 1 September 2026 is a Tuesday; the 30th is a Wednesday.
    const weeks = monthGrid("2026-09-30");

    expect(weeks).toHaveLength(5);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
    expect(weeks[0]).toEqual([
      null,
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(weeks[4]).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", null, null, null, null]);
  });

  it("starts with no padding when the 1st is a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid("2026-06-10")[0][0]).toBe("2026-06-01");
  });
});

describe("formatting", () => {
  it("formats a day heading and a month label without shifting the date", () => {
    expect(formatDayHeading("2026-09-30")).toBe("Wednesday, September 30, 2026");
    expect(formatDayHeading("2026-01-01")).toBe("Thursday, January 1, 2026");
    expect(formatMonthLabel("2026-09-30")).toBe("September 2026");
  });
});
