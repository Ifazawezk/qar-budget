import { describe, expect, it } from "vitest";
import { newId, remove, restore, sortNewestFirst, upsert } from "./transactions";
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

describe("newId", () => {
  it("returns distinct ids", () => {
    const ids = new Set(Array.from({ length: 100 }, newId));
    expect(ids.size).toBe(100);
  });
});
