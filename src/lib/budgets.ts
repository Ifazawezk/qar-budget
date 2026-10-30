import type { Dirhams } from "./money";
import type { MonthSummary } from "./summary";
import type { Budgets } from "./types";

export type BudgetState = "ok" | "near" | "over";

/** Share of a budget at which a category is flagged as close to its limit. */
export const NEAR_LIMIT = 0.8;

export interface BudgetLine {
  category: string;
  limit: Dirhams;
  spent: Dirhams;
  /** Negative when over budget. */
  remaining: Dirhams;
  /** spent / limit, can go above 1. */
  ratio: number;
  state: BudgetState;
}

export function budgetState(spent: Dirhams, limit: Dirhams): BudgetState {
  if (spent > limit) return "over";
  return spent >= limit * NEAR_LIMIT ? "near" : "ok";
}

/** Progress for every category that has a budget, the most used first. */
export function budgetLines(budgets: Budgets, summary: MonthSummary): BudgetLine[] {
  const spentBy = new Map(summary.spending.map((c) => [c.category, c.total]));
  return Object.entries(budgets)
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const spent = spentBy.get(category) ?? 0;
      return {
        category,
        limit,
        spent,
        remaining: limit - spent,
        ratio: spent / limit,
        state: budgetState(spent, limit),
      };
    })
    .sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));
}

export function budgetTotals(lines: readonly BudgetLine[]): { limit: Dirhams; spent: Dirhams } {
  return lines.reduce(
    (sum, line) => ({ limit: sum.limit + line.limit, spent: sum.spent + line.spent }),
    { limit: 0, spent: 0 },
  );
}

/** Set or clear (with 0) the limit for one category. */
export function setBudget(budgets: Budgets, category: string, limit: Dirhams): Budgets {
  const next = { ...budgets };
  if (limit > 0) next[category] = limit;
  else delete next[category];
  return next;
}
