import { describe, expect, it } from "vitest";
import { budgetLines, budgetState, budgetTotals, setBudget } from "./budgets";
import { summarize } from "./summary";
import type { Transaction } from "./types";

function spend(amount: number, category: string, date = "2026-10-10"): Transaction {
  return { id: `${category}-${amount}-${date}`, kind: "expense", amount, category, date, note: "" };
}

describe("budgetState", () => {
  it("warns from 80% and flags anything above the limit", () => {
    expect(budgetState(0, 1000)).toBe("ok");
    expect(budgetState(799, 1000)).toBe("ok");
    expect(budgetState(800, 1000)).toBe("near");
    expect(budgetState(1000, 1000)).toBe("near");
    expect(budgetState(1001, 1000)).toBe("over");
  });
});

describe("budgetLines", () => {
  const transactions = [
    spend(60000, "groceries"),
    spend(35000, "groceries"),
    spend(45000, "dining"),
    spend(10000, "transport"),
    // Last month's spending does not count against this month.
    spend(99000, "transport", "2026-09-30"),
  ];
  const budgets = { groceries: 100000, dining: 40000, transport: 50000, shopping: 30000 };
  const lines = budgetLines(budgets, summarize(transactions, "2026-10"));

  it("lists every budgeted category, most used first", () => {
    expect(lines.map((l) => [l.category, l.state])).toEqual([
      ["dining", "over"],
      ["groceries", "near"],
      ["transport", "ok"],
      ["shopping", "ok"],
    ]);
  });

  it("reports what is left, negative when over", () => {
    const byCategory = Object.fromEntries(lines.map((l) => [l.category, l]));
    expect(byCategory.dining?.remaining).toBe(-5000);
    expect(byCategory.groceries?.remaining).toBe(5000);
    expect(byCategory.shopping).toMatchObject({ spent: 0, remaining: 30000, ratio: 0 });
  });

  it("adds up all budgets", () => {
    expect(budgetTotals(lines)).toEqual({ limit: 220000, spent: 150000 });
    expect(budgetTotals([])).toEqual({ limit: 0, spent: 0 });
  });
});

describe("setBudget", () => {
  it("sets, changes and clears limits without touching the input", () => {
    const budgets = { dining: 40000 };
    expect(setBudget(budgets, "groceries", 100000)).toEqual({ dining: 40000, groceries: 100000 });
    expect(setBudget(budgets, "dining", 50000)).toEqual({ dining: 50000 });
    expect(setBudget(budgets, "dining", 0)).toEqual({});
    expect(budgets).toEqual({ dining: 40000 });
  });
});
