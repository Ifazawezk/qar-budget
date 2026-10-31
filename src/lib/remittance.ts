import type { Dirhams } from "./money";
import type { Transaction } from "./types";

/** The "Money sent home" category. Like every category id, it must never change. */
export const REMITTANCE_CATEGORY = "remittance";

export interface MonthTotal {
  month: string;
  total: Dirhams;
}

export interface RemittanceYear {
  year: string;
  total: Dirhams;
  /** How many transfers make up the total. */
  count: number;
  /** All twelve months, January first, including months with nothing sent. */
  months: MonthTotal[];
  /** The month with the most sent, the earliest one on a tie. Null when nothing was sent. */
  peak: MonthTotal | null;
  /** Total as a fraction of the year's income, or null for a year without income. */
  shareOfIncome: number | null;
}

export function isRemittance(tx: Transaction): boolean {
  return tx.kind === "expense" && tx.category === REMITTANCE_CATEGORY;
}

export function remittanceYear(transactions: readonly Transaction[], year: string): RemittanceYear {
  const totals = new Array<Dirhams>(12).fill(0);
  let count = 0;
  let income = 0;

  for (const tx of transactions) {
    if (!tx.date.startsWith(`${year}-`)) continue;
    if (tx.kind === "income") income += tx.amount;
    if (!isRemittance(tx)) continue;
    const index = Number(tx.date.slice(5, 7)) - 1;
    totals[index] = (totals[index] ?? 0) + tx.amount;
    count++;
  }

  const months = totals.map((total, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    total,
  }));
  const total = totals.reduce((sum, value) => sum + value, 0);
  const peak = months.reduce<MonthTotal | null>(
    (best, month) => (month.total > (best?.total ?? 0) ? month : best),
    null,
  );

  return { year, total, count, months, peak, shareOfIncome: income > 0 ? total / income : null };
}
