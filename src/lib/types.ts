import type { Dirhams } from "./money";

export type Kind = "income" | "expense";

export interface Transaction {
  id: string;
  kind: Kind;
  /** Always positive. Whether it adds or subtracts comes from `kind`. */
  amount: Dirhams;
  category: string;
  /** Local date as YYYY-MM-DD. */
  date: string;
  note: string;
}

/** Monthly spending limit per expense category id. Categories without a limit are absent. */
export type Budgets = Record<string, Dirhams>;

export interface AppData {
  transactions: Transaction[];
  budgets: Budgets;
}
