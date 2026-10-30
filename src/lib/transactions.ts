import type { Transaction } from "./types";

/** Newest date first. Entries on the same day keep the most recently added on top. */
export function sortNewestFirst(transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => (a.tx.date === b.tx.date ? b.index - a.index : a.tx.date < b.tx.date ? 1 : -1))
    .map(({ tx }) => tx);
}

/** Replace the entry with the same id, or add it at the end. */
export function upsert(transactions: readonly Transaction[], tx: Transaction): Transaction[] {
  const index = transactions.findIndex((t) => t.id === tx.id);
  if (index === -1) return [...transactions, tx];
  const next = [...transactions];
  next[index] = tx;
  return next;
}

export function remove(transactions: readonly Transaction[], id: string): Transaction[] {
  return transactions.filter((t) => t.id !== id);
}

/** Put a removed entry back where it was, for undo. */
export function restore(
  transactions: readonly Transaction[],
  tx: Transaction,
  index: number,
): Transaction[] {
  const next = remove(transactions, tx.id);
  next.splice(Math.min(Math.max(index, 0), next.length), 0, tx);
  return next;
}

export interface MergeResult {
  transactions: Transaction[];
  added: number;
  updated: number;
  skipped: number;
}

function sameContent(tx: Transaction): string {
  return [tx.date, tx.kind, tx.category, tx.amount, tx.note].join("\u0000");
}

/**
 * Combine imported entries with the ones already saved.
 *
 * - An entry whose id is already saved replaces it (restoring a backup).
 * - An entry identical to a saved one is skipped (importing the same CSV twice).
 *   Matching is one to one: two identical coffees in a file only match two
 *   identical coffees already saved, so a real second purchase is never lost.
 */
export function mergeTransactions(
  existing: readonly Transaction[],
  incoming: readonly Transaction[],
): MergeResult {
  const result = [...existing];
  const indexById = new Map(result.map((tx, i) => [tx.id, i]));
  const unmatched = new Map<string, number>();
  for (const tx of existing) unmatched.set(sameContent(tx), (unmatched.get(sameContent(tx)) ?? 0) + 1);
  const useMatch = (key: string) => unmatched.set(key, (unmatched.get(key) ?? 0) - 1);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const rest: Transaction[] = [];

  // Id matches first, so they claim their own saved entry before content matching runs.
  for (const tx of incoming) {
    const index = indexById.get(tx.id);
    const current = index === undefined ? undefined : result[index];
    if (index === undefined || !current) {
      rest.push(tx);
      continue;
    }
    useMatch(sameContent(current));
    if (sameContent(current) === sameContent(tx)) {
      skipped++;
    } else {
      result[index] = tx;
      updated++;
    }
  }

  for (const tx of rest) {
    const key = sameContent(tx);
    if ((unmatched.get(key) ?? 0) > 0) {
      useMatch(key);
      skipped++;
      continue;
    }
    if (indexById.has(tx.id)) {
      // The same id twice within one file; keep the first.
      skipped++;
      continue;
    }
    indexById.set(tx.id, result.length);
    result.push(tx);
    added++;
  }

  return { transactions: result, added, updated, skipped };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // randomUUID needs a secure context; fall back for plain http on a local network.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
