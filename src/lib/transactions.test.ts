import { describe, expect, it } from "vitest";
import {
  mergeTransactions,
  newId,
  remove,
  restore,
  sortNewestFirst,
  upsert,
} from "./transactions";
import type { Transaction } from "./types";

function tx(id: string, date: string, amount = 1000): Transaction {
  return { id, kind: "expense", amount, category: "groceries", date, note: "" };
}

describe("sortNewestFirst", () => {
  it("orders by date, newest first", () => {
    const list = [tx("a", "2026-10-02"), tx("b", "2026-10-10"), tx("c", "2026-09-30")];
    expect(sortNewestFirst(list).map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("puts the last added entry on top within a day", () => {
    const list = [tx("a", "2026-10-05"), tx("b", "2026-10-05"), tx("c", "2026-10-05")];
    expect(sortNewestFirst(list).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("does not change the input", () => {
    const list = [tx("a", "2026-10-01"), tx("b", "2026-10-02")];
    sortNewestFirst(list);
    expect(list.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("upsert, remove and restore", () => {
  const list = [tx("a", "2026-10-01"), tx("b", "2026-10-02"), tx("c", "2026-10-03")];

  it("adds new entries at the end", () => {
    expect(upsert(list, tx("d", "2026-10-04")).map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("replaces an entry in place when editing", () => {
    const edited = upsert(list, tx("b", "2026-10-02", 5000));
    expect(edited.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(edited[1]?.amount).toBe(5000);
    expect(list[1]?.amount).toBe(1000);
  });

  it("removes by id and can put the entry back", () => {
    const removed = remove(list, "b");
    expect(removed.map((t) => t.id)).toEqual(["a", "c"]);
    expect(restore(removed, tx("b", "2026-10-02"), 1).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(restore(removed, tx("b", "2026-10-02"), 99).map((t) => t.id)).toEqual(["a", "c", "b"]);
  });
});

describe("mergeTransactions", () => {
  const coffee = (id: string) => ({ ...tx(id, "2026-10-05", 1200), category: "dining" });

  it("adds new entries and skips ones already saved", () => {
    const saved = [tx("a", "2026-10-01"), tx("b", "2026-10-02")];
    // CSV imports get fresh ids, so only the content can tell they are the same.
    const incoming = [tx("x", "2026-10-02"), tx("y", "2026-10-03")];
    const result = mergeTransactions(saved, incoming);
    expect(result.transactions.map((t) => t.id)).toEqual(["a", "b", "y"]);
    expect([result.added, result.updated, result.skipped]).toEqual([1, 0, 1]);
  });

  it("matches identical entries one to one", () => {
    const result = mergeTransactions([coffee("a")], [coffee("x"), coffee("y")]);
    expect(result.transactions.map((t) => t.id)).toEqual(["a", "y"]);
    expect([result.added, result.skipped]).toEqual([1, 1]);
  });

  it("replaces entries with the same id when restoring a backup", () => {
    const saved = [tx("a", "2026-10-01", 1000), tx("b", "2026-10-02")];
    const backup = [tx("a", "2026-10-01", 2500), tx("b", "2026-10-02")];
    const result = mergeTransactions(saved, backup);
    expect(result.transactions.map((t) => t.amount)).toEqual([2500, 1000]);
    expect([result.added, result.updated, result.skipped]).toEqual([0, 1, 1]);
  });

  it("lets an id match claim its own entry before content matching", () => {
    // y comes first in the file but must not swallow a's saved twin.
    const result = mergeTransactions([coffee("a")], [coffee("y"), coffee("a")]);
    expect(result.transactions.map((t) => t.id)).toEqual(["a", "y"]);
    expect([result.added, result.skipped]).toEqual([1, 1]);
  });

  it("keeps the first of two entries with the same id in one file", () => {
    const result = mergeTransactions([], [tx("a", "2026-10-01"), tx("a", "2026-10-09")]);
    expect(result.transactions.map((t) => t.date)).toEqual(["2026-10-01"]);
    expect(result.skipped).toBe(1);
  });
});

describe("newId", () => {
  it("returns distinct ids", () => {
    const ids = new Set(Array.from({ length: 100 }, newId));
    expect(ids.size).toBe(100);
  });
});
