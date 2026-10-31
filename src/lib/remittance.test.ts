import { describe, expect, it } from "vitest";
import { isRemittance, remittanceYear } from "./remittance";
import type { Transaction } from "./types";

function tx(date: string, amount: number, category = "remittance", kind: Transaction["kind"] = "expense") {
  return { id: `${date}-${amount}`, kind, amount, category, date, note: "" };
}

describe("isRemittance", () => {
  it("counts only expenses in the money sent home category", () => {
    expect(isRemittance(tx("2026-01-01", 100))).toBe(true);
    expect(isRemittance(tx("2026-01-01", 100, "groceries"))).toBe(false);
    expect(isRemittance(tx("2026-01-01", 100, "remittance", "income"))).toBe(false);
  });
});

describe("remittanceYear", () => {
  it("adds up one calendar year and leaves out the years around it", () => {
    const year = remittanceYear(
      [
        tx("2025-12-31", 1),
        tx("2026-01-01", 150000),
        tx("2026-01-20", 50000),
        tx("2026-12-31", 100000),
        tx("2027-01-01", 2),
      ],
      "2026",
    );
    expect(year.total).toBe(300000);
    expect(year.count).toBe(3);
  });

  it("always returns twelve months in order, January first", () => {
    const year = remittanceYear([tx("2026-03-05", 1000), tx("2026-03-09", 500)], "2026");
    expect(year.months).toHaveLength(12);
    expect(year.months[0]).toEqual({ month: "2026-01", total: 0 });
    expect(year.months[2]).toEqual({ month: "2026-03", total: 1500 });
    expect(year.months[11]).toEqual({ month: "2026-12", total: 0 });
  });

  it("does not count other spending", () => {
    expect(remittanceYear([tx("2026-03-05", 1000, "groceries")], "2026").total).toBe(0);
  });

  it("finds the biggest month and keeps the earliest on a tie", () => {
    const year = remittanceYear(
      [tx("2026-02-01", 500), tx("2026-05-01", 900), tx("2026-08-01", 900)],
      "2026",
    );
    expect(year.peak).toEqual({ month: "2026-05", total: 900 });
  });

  it("works out the share of the same year's income", () => {
    const year = remittanceYear(
      [
        tx("2026-01-01", 1000000, "salary", "income"),
        tx("2025-01-01", 9000000, "salary", "income"),
        tx("2026-02-01", 250000),
      ],
      "2026",
    );
    expect(year.shareOfIncome).toBe(0.25);
  });

  it("has no share without income and can go past the whole of it", () => {
    expect(remittanceYear([tx("2026-02-01", 500)], "2026").shareOfIncome).toBeNull();
    const over = remittanceYear([tx("2026-02-01", 500), tx("2026-01-01", 250, "salary", "income")], "2026");
    expect(over.shareOfIncome).toBe(2);
  });

  it("handles a year with nothing sent", () => {
    const year = remittanceYear([], "2026");
    expect(year.total).toBe(0);
    expect(year.count).toBe(0);
    expect(year.peak).toBeNull();
    expect(year.shareOfIncome).toBeNull();
  });

  it("keeps totals exact in dirhams", () => {
    const year = remittanceYear([tx("2026-01-01", 10), tx("2026-01-02", 20)], "2026");
    expect(year.total).toBe(30);
  });
});
