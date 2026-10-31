import { describe, expect, it } from "vitest";
import { exportCSV, exportFileName, exportJSON, importFile } from "./files";
import { DataError } from "./storage";
import type { AppData, RecurringRule } from "./types";

function counter(): () => string {
  let n = 0;
  return () => `new${++n}`;
}

const data: AppData = {
  transactions: [
    { id: "a", kind: "income", amount: 1500000, category: "salary", date: "2026-10-01", note: "" },
    { id: "b", kind: "expense", amount: 4550, category: "groceries", date: "2026-10-03", note: "سوق" },
  ],
  budgets: { groceries: 150000 },
  recurring: [],
};

const empty: AppData = { transactions: [], budgets: {}, recurring: [] };

const rent: RecurringRule = {
  id: "rent",
  kind: "expense",
  amount: 420000,
  category: "housing",
  note: "",
  frequency: "monthly",
  startDate: "2026-01-31",
  nextDue: "2026-11-30",
  paused: false,
};

describe("JSON backups", () => {
  it("restores everything into an empty app", () => {
    const result = importFile(empty, "backup.json", exportJSON(data), counter());
    expect(result.data).toEqual(data);
    expect([result.added, result.updated, result.skipped]).toEqual([2, 0, 0]);
  });

  it("does not duplicate anything when the same backup is imported twice", () => {
    const result = importFile(data, "backup.json", exportJSON(data), counter());
    expect(result.data).toEqual(data);
    expect(result.skipped).toBe(2);
  });

  it("keeps local budgets and takes the imported value when both have one", () => {
    const local: AppData = { ...empty, budgets: { dining: 40000, groceries: 1 } };
    expect(importFile(local, "b.json", exportJSON(data), counter()).data.budgets).toEqual({
      dining: 40000,
      groceries: 150000,
    });
  });

  it("upgrades a backup from schema version 1", () => {
    const old = JSON.stringify({ version: 1, transactions: data.transactions });
    expect(importFile(empty, "old.json", old, counter()).data).toEqual({
      transactions: data.transactions,
      budgets: {},
      recurring: [],
    });
  });

  it("restores recurring entries", () => {
    const backup = exportJSON({ ...data, recurring: [rent] });
    expect(importFile(empty, "b.json", backup, counter()).data.recurring).toEqual([rent]);
  });

  it("keeps local recurring entries when the backup is older than them", () => {
    const local: AppData = { ...empty, recurring: [rent] };
    const old = JSON.stringify({ version: 2, transactions: [], budgets: {} });
    expect(importFile(local, "old.json", old, counter()).data.recurring).toEqual([rent]);
  });

  it("does not move a schedule backwards when an old backup is restored", () => {
    const local: AppData = { ...empty, recurring: [rent] };
    const backup = exportJSON({ ...empty, recurring: [{ ...rent, nextDue: "2026-03-31" }] });
    expect(importFile(local, "b.json", backup, counter()).data.recurring[0]?.nextDue).toBe("2026-11-30");
  });

  it("rejects broken files with a clear error", () => {
    expect(() => importFile(empty, "x.json", "{oops", counter())).toThrow("not valid JSON");
    expect(() => importFile(empty, "x.json", '{"version":99}', counter())).toThrow(DataError);
  });
});

describe("CSV", () => {
  it("round-trips entries with new ids and leaves budgets and recurring entries alone", () => {
    const csv = exportCSV(data);
    expect(csv.startsWith("﻿")).toBe(true);
    const current: AppData = { ...empty, budgets: { dining: 5 }, recurring: [rent] };
    const result = importFile(current, "e.csv", csv, counter());
    expect(result.data.budgets).toEqual({ dining: 5 });
    expect(result.data.recurring).toEqual([rent]);
    expect(result.data.transactions.map((t) => [t.id, t.amount, t.note])).toEqual([
      ["new1", 1500000, ""],
      ["new2", 4550, "سوق"],
    ]);
  });

  it("skips entries that are already saved", () => {
    const result = importFile(data, "e.csv", exportCSV(data), counter());
    expect([result.added, result.skipped]).toEqual([0, 2]);
  });

  it("passes row problems through and fails on a wrong header", () => {
    const result = importFile(empty, "e.csv", "date,type,category,amount\n2026-10-01,expense,x,0\n", counter());
    expect(result.issues).toEqual([{ line: 2, field: "amount" }]);
    expect(() => importFile(empty, "e.csv", "when,what\n1,2\n", counter())).toThrow(/columns/);
  });
});

describe("exportFileName", () => {
  it("includes the local date", () => {
    expect(exportFileName("csv", new Date(2026, 9, 30, 23, 30))).toBe("qar-budget-2026-10-30.csv");
  });
});
