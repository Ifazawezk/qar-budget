import { describe, expect, it } from "vitest";
import { inMonth, percentChange, savingsRate, summarize } from "./summary";
import type { Kind, Transaction } from "./types";

let seq = 0;
function tx(kind: Kind, amount: number, category: string, date: string): Transaction {
  return { id: String(seq++), kind, amount, category, date, note: "" };
}

const data = [
  tx("income", 1500000, "salary", "2026-10-01"),
  tx("expense", 450000, "housing", "2026-10-01"),
  tx("expense", 12050, "groceries", "2026-10-04"),
  tx("expense", 8000, "groceries", "2026-10-18"),
  tx("expense", 3500, "dining", "2026-10-31"),
  tx("income", 50000, "freelance", "2026-10-20"),
  // Other months must not leak in.
  tx("expense", 99999, "groceries", "2026-09-30"),
  tx("expense", 99999, "dining", "2026-11-01"),
];

describe("summarize", () => {
  const summary = summarize(data, "2026-10");

  it("adds up income, spending and balance for the month", () => {
    expect(summary.income).toBe(1550000);
    expect(summary.expense).toBe(473550);
    expect(summary.balance).toBe(1550000 - 473550);
    expect(summary.count).toBe(6);
  });

  it("groups spending by category, largest first", () => {
    expect(summary.spending.map((c) => [c.category, c.total])).toEqual([
      ["housing", 450000],
      ["groceries", 20050],
      ["dining", 3500],
    ]);
    const shares = summary.spending.reduce((sum, c) => sum + c.share, 0);
    expect(shares).toBeCloseTo(1);
  });

  it("handles an empty month", () => {
    expect(summarize(data, "2026-08")).toEqual({
      month: "2026-08",
      income: 0,
      expense: 0,
      balance: 0,
      count: 0,
      spending: [],
    });
  });

  it("allows a negative balance", () => {
    expect(summarize(data, "2026-11").balance).toBe(-99999);
  });

  it("filters entries by month", () => {
    expect(inMonth(data, "2026-09")).toHaveLength(1);
    expect(inMonth(data, "2026-10")).toHaveLength(6);
  });
});

describe("percentChange and savingsRate", () => {
  it("compares with the previous month", () => {
    expect(percentChange(1200, 1000)).toBeCloseTo(0.2);
    expect(percentChange(500, 1000)).toBeCloseTo(-0.5);
    expect(percentChange(500, 0)).toBeNull();
  });

  it("reports how much income was kept", () => {
    expect(savingsRate(summarize(data, "2026-10"))).toBeCloseTo(1076450 / 1550000);
    expect(savingsRate(summarize(data, "2026-11"))).toBeNull();
  });
});
