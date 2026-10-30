import { describe, expect, it } from "vitest";
import {
  currentMonth,
  isValidDate,
  isValidMonth,
  monthOf,
  parseLocalDate,
  shiftMonth,
  toISODate,
  today,
} from "./dates";

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDate("2026-10-30")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-1-5")).toBe(false);
    expect(isValidDate("30/10/2026")).toBe(false);
  });

  it("validates months", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("2026-13")).toBe(false);
  });

  it("parses dates in local time", () => {
    const date = parseLocalDate("2026-03-05");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 5]);
    expect(toISODate(date)).toBe("2026-03-05");
  });

  it("uses local time for today", () => {
    // 1 am local time must still be the same calendar day.
    const lateNight = new Date(2026, 9, 30, 1, 15);
    expect(today(lateNight)).toBe("2026-10-30");
    expect(currentMonth(lateNight)).toBe("2026-10");
  });

  it("moves between months across year boundaries", () => {
    expect(monthOf("2026-10-30")).toBe("2026-10");
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-03", -14)).toBe("2025-01");
    expect(() => shiftMonth("2026-1", 1)).toThrow(RangeError);
  });
});
