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

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // randomUUID needs a secure context; fall back for plain http on a local network.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
