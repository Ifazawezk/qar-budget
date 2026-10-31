import { addDays, dayOfMonth, monthOf, shiftMonth } from "./dates";
import type { Frequency, RecurringRule, Transaction } from "./types";

/**
 * The most entries one rule adds in a single run. Whatever is left stays due and is
 * added on the next open, so nothing is lost, and a bad date cannot flood the list.
 */
export const CATCH_UP_LIMIT = 120;

/** How far back a rule can start. It also catches typing the wrong year. */
export const MAX_BACKFILL_MONTHS = 12;

export const FREQUENCIES: readonly Frequency[] = ["monthly", "weekly"];

/** What the form collects. `date` is the first date of a new rule, or the next date of a saved one. */
export type RuleInput = Pick<RecurringRule, "kind" | "amount" | "category" | "note" | "frequency"> & {
  date: string;
};

type Schedule = Pick<RecurringRule, "frequency" | "startDate">;

export function anchorDay(rule: Pick<RecurringRule, "startDate">): number {
  return Number(rule.startDate.slice(8, 10));
}

/** The date after `date`. Monthly dates come from the anchor day, so a short month cannot move it. */
export function followingDate(rule: Schedule, date: string): string {
  if (rule.frequency === "weekly") return addDays(date, 7);
  return dayOfMonth(shiftMonth(monthOf(date), 1), anchorDay(rule));
}

/**
 * The id of the entry for one date of one rule. It is fixed, not random, so running
 * twice, a second tab or a restored backup can never turn one date into two entries.
 */
export function occurrenceId(ruleId: string, date: string): string {
  return `${ruleId}@${date}`;
}

export interface PostResult {
  transactions: Transaction[];
  recurring: RecurringRule[];
  /** Entries added by this run. */
  posted: number;
  /** False when nothing changed and there is nothing to save. */
  changed: boolean;
}

/**
 * Add an entry for every date that is due up to and including `today`.
 *
 * Entries are ordinary transactions from then on: a rule never touches one it already
 * made, and moving `nextDue` past a date is what stops a deleted entry coming back.
 */
export function postDue(
  transactions: readonly Transaction[],
  rules: readonly RecurringRule[],
  today: string,
): PostResult {
  const ids = new Set(transactions.map((tx) => tx.id));
  const added: Transaction[] = [];
  let changed = false;

  const recurring = rules.map((rule) => {
    if (rule.paused) return rule;
    let date = rule.nextDue;
    for (let i = 0; i < CATCH_UP_LIMIT && date <= today; i++) {
      const id = occurrenceId(rule.id, date);
      if (!ids.has(id)) {
        ids.add(id);
        const { kind, amount, category, note } = rule;
        added.push({ id, kind, amount, category, note, date });
      }
      date = followingDate(rule, date);
    }
    if (date === rule.nextDue) return rule;
    changed = true;
    return { ...rule, nextDue: date };
  });

  added.sort((a, b) => a.date.localeCompare(b.date));
  return { transactions: [...transactions, ...added], recurring, posted: added.length, changed };
}

/** The first date of a rule's schedule on or after `date`. */
export function nextOnOrAfter(rule: RecurringRule, date: string): string {
  let next = rule.nextDue;
  while (next < date) next = followingDate(rule, next);
  return next;
}

/** Skips the dates missed while paused: pausing means those entries were not wanted. */
export function resumeRule(rule: RecurringRule, today: string): RecurringRule {
  return { ...rule, paused: false, nextDue: nextOnOrAfter(rule, today) };
}

/** The date to show for a rule. A paused rule's saved date can be long past, so show when it would run. */
export function upcomingDate(rule: RecurringRule, today: string): string {
  return rule.paused ? nextOnOrAfter(rule, today) : rule.nextDue;
}

export function createRule(id: string, input: RuleInput): RecurringRule {
  const { date, ...fields } = input;
  return { id, ...fields, startDate: date, nextDue: date, paused: false };
}

/**
 * Apply a saved form. Entries already made stay as they are.
 *
 * The schedule only restarts when the date or frequency really changed. Otherwise
 * changing the amount of a 31st rule while it shows 28 February would move it to the 28th.
 */
export function applyRuleEdit(rule: RecurringRule, input: RuleInput, today: string): RecurringRule {
  const { date, ...fields } = input;
  const restarted = date !== upcomingDate(rule, today) || input.frequency !== rule.frequency;
  if (!restarted) return { ...rule, ...fields };
  return { ...rule, ...fields, startDate: date, nextDue: date };
}

/** The earliest date a rule may be set to start on. */
export function earliestStart(today: string): string {
  const month = shiftMonth(monthOf(today), -MAX_BACKFILL_MONTHS);
  return dayOfMonth(month, Number(today.slice(8, 10)));
}

export function isAllowedStart(date: string, today: string): boolean {
  return date >= earliestStart(today);
}

/**
 * Combine imported rules with saved ones. Like budgets, the imported rule wins, but its
 * next date never moves backwards, so an old backup cannot bring back entries already
 * handled here.
 */
export function mergeRules(
  existing: readonly RecurringRule[],
  incoming: readonly RecurringRule[],
): RecurringRule[] {
  const result = [...existing];
  for (const rule of incoming) {
    const index = result.findIndex((r) => r.id === rule.id);
    const saved = result[index];
    if (!saved) {
      result.push(rule);
    } else {
      result[index] = { ...rule, nextDue: saved.nextDue > rule.nextDue ? saved.nextDue : rule.nextDue };
    }
  }
  return result;
}

/** Soonest first, with paused rules at the end. */
export function sortRules(rules: readonly RecurringRule[]): RecurringRule[] {
  return [...rules].sort(
    (a, b) => Number(a.paused) - Number(b.paused) || a.nextDue.localeCompare(b.nextDue),
  );
}
