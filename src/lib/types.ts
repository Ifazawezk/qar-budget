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

export type Frequency = "monthly" | "weekly";

/** A schedule, such as rent or salary, that adds a normal entry each time it falls due. */
export interface RecurringRule {
  id: string;
  kind: Kind;
  amount: Dirhams;
  category: string;
  note: string;
  frequency: Frequency;
  /**
   * The date the schedule hangs on. A monthly rule always returns to this date's day
   * of the month, so one set for the 31st is back on the 31st after a short February.
   */
  startDate: string;
  /** The next date an entry is due. */
  nextDue: string;
  paused: boolean;
}

export interface AppData {
  transactions: Transaction[];
  budgets: Budgets;
  recurring: RecurringRule[];
}
