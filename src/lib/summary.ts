import { monthOf } from "./dates";
import type { Dirhams } from "./money";
import type { Transaction } from "./types";

export interface CategoryTotal {
  category: string;
  total: Dirhams;
  /** Fraction of the month's spending, 0 to 1. */
  share: number;
}

export interface MonthSummary {
  month: string;
  income: Dirhams;
  expense: Dirhams;
  balance: Dirhams;
  count: number;
  /** Expense totals per category, largest first. */
  spending: CategoryTotal[];
}

export function inMonth(transactions: readonly Transaction[], month: string): Transaction[] {
  return transactions.filter((tx) => monthOf(tx.date) === month);
}

export function summarize(transactions: readonly Transaction[], month: string): MonthSummary {
  let income = 0;
  let expense = 0;
  let count = 0;
  const byCategory = new Map<string, Dirhams>();

  for (const tx of transactions) {
    if (monthOf(tx.date) !== month) continue;
    count++;
    if (tx.kind === "income") {
      income += tx.amount;
    } else {
      expense += tx.amount;
      byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + tx.amount);
    }
  }

  const spending = [...byCategory]
    .map(([category, total]) => ({ category, total, share: total / expense }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  return { month, income, expense, balance: income - expense, count, spending };
}

/** Relative change from `previous` to `current`, or null when there is nothing to compare with. */
export function percentChange(current: Dirhams, previous: Dirhams): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/** Share of income left after spending, or null for a month without income. */
export function savingsRate(summary: MonthSummary): number | null {
  if (summary.income === 0) return null;
  return summary.balance / summary.income;
}
