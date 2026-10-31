import { describe, expect, it } from "vitest";
import {
  addDays,
  currentMonth,
  dayOfMonth,
  daysInMonth,
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

  it("keeps four digit years when moving months", () => {
    expect(shiftMonth("0999-12", 1)).toBe("1000-01");
    expect(shiftMonth("0999-10", 1)).toBe("0999-11");
  });

  it("knows how long each month is", () => {
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2100-02")).toBe(28);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });

  it("uses the last day when a month is too short for the day asked for", () => {
    expect(dayOfMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dayOfMonth("2028-02", 31)).toBe("2028-02-29");
    expect(dayOfMonth("2026-04", 31)).toBe("2026-04-30");
    expect(dayOfMonth("2026-03", 31)).toBe("2026-03-31");
    expect(dayOfMonth("2026-03", 5)).toBe("2026-03-05");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-10-30", 7)).toBe("2026-11-06");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
