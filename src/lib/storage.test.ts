import { describe, expect, it } from "vitest";
import {
  BACKUP_KEY,
  DataError,
  type KeyValueStore,
  load,
  loadSettings,
  migrate,
  save,
  saveSettings,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  STORAGE_KEY,
} from "./storage";
import type { AppData } from "./types";

class MemoryStore implements KeyValueStore {
  items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const sample: AppData = {
  transactions: [
    { id: "a", kind: "income", amount: 1500000, category: "salary", date: "2026-10-01", note: "" },
    { id: "b", kind: "expense", amount: 4550, category: "groceries", date: "2026-10-03", note: "Lulu" },
  ],
  budgets: { groceries: 150000 },
  recurring: [
    {
      id: "rent",
      kind: "expense",
      amount: 420000,
      category: "housing",
      note: "Rent",
      frequency: "monthly",
      startDate: "2026-01-31",
      nextDue: "2026-11-30",
      paused: false,
    },
  ],
};

describe("load and save", () => {
  it("starts empty when nothing is saved", () => {
    expect(load(new MemoryStore())).toEqual({
      data: { transactions: [], budgets: {}, recurring: [] },
      problem: null,
    });
  });

  it("round-trips data with the schema version", () => {
    const store = new MemoryStore();
    save(store, sample);
    expect(JSON.parse(store.getItem(STORAGE_KEY) ?? "").version).toBe(SCHEMA_VERSION);
    expect(load(store)).toEqual({ data: sample, problem: null });
  });

  it("keeps a backup when saved data cannot be read", () => {
    const store = new MemoryStore();
    store.setItem(STORAGE_KEY, "{not json");
    const result = load(store);
    expect(result.data.transactions).toEqual([]);
    expect(result.problem).toBeTruthy();
    expect(store.getItem(BACKUP_KEY)).toBe("{not json");
  });

  it("opens data saved by the previous version without losing anything", () => {
    const store = new MemoryStore();
    const saved = { version: 2, transactions: sample.transactions, budgets: sample.budgets };
    store.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(load(store)).toEqual({
      data: { transactions: sample.transactions, budgets: sample.budgets, recurring: [] },
      problem: null,
    });
    expect(store.getItem(BACKUP_KEY)).toBeNull();
  });
});

describe("settings", () => {
  it("falls back to defaults for missing or unknown values", () => {
    const store = new MemoryStore();
    expect(loadSettings(store)).toEqual({ theme: "auto", lang: "en", lastCategory: {} });
    store.setItem(SETTINGS_KEY, '{"theme":"purple","lang":"fr"}');
    expect(loadSettings(store)).toEqual({ theme: "auto", lang: "en", lastCategory: {} });
    store.setItem(SETTINGS_KEY, "oops");
    expect(loadSettings(store, "ar")).toEqual({ theme: "auto", lang: "ar", lastCategory: {} });
  });

  it("prefers the saved language over the browser language", () => {
    const store = new MemoryStore();
    saveSettings(store, { theme: "dark", lang: "en", lastCategory: {} });
    expect(loadSettings(store, "ar")).toEqual({ theme: "dark", lang: "en", lastCategory: {} });
  });

  it("remembers the last category for each kind of entry", () => {
    const store = new MemoryStore();
    const lastCategory = { expense: "groceries", income: "freelance" };
    saveSettings(store, { theme: "auto", lang: "en", lastCategory });
    expect(loadSettings(store).lastCategory).toEqual(lastCategory);
  });

  it("drops a remembered category that does not belong to that kind", () => {
    const store = new MemoryStore();
    store.setItem(
      SETTINGS_KEY,
      JSON.stringify({ lastCategory: { expense: "salary", income: "freelance", other: "x" } }),
    );
    expect(loadSettings(store).lastCategory).toEqual({ income: "freelance" });
    store.setItem(SETTINGS_KEY, '{"lastCategory":"groceries"}');
    expect(loadSettings(store).lastCategory).toEqual({});
  });
});

describe("migrate", () => {
  it("upgrades version 1 data through every step", () => {
    const v1 = { version: 1, transactions: sample.transactions };
    expect(migrate(v1)).toEqual({ transactions: sample.transactions, budgets: {}, recurring: [] });
  });

  it("upgrades version 2 data, which had no recurring entries", () => {
    const v2 = { version: 2, transactions: sample.transactions, budgets: sample.budgets };
    expect(migrate(v2)).toEqual({
      transactions: sample.transactions,
      budgets: sample.budgets,
      recurring: [],
    });
  });

  it("does not change a version 3 document", () => {
    expect(migrate({ version: 3, ...sample })).toEqual(sample);
  });

  it("checks recurring entries", () => {
    const rule = sample.recurring[0];
    const doc = (changes: object) => ({
      version: 3,
      transactions: [],
      budgets: {},
      recurring: [{ ...rule, ...changes }],
    });
    expect(() => migrate({ version: 3, transactions: [], budgets: {} })).toThrow(/recurring/);
    expect(() => migrate(doc({ frequency: "daily" }))).toThrow("Recurring entry 1 has an unknown frequency");
    expect(() => migrate(doc({ nextDue: "2026-02-31" }))).toThrow(/invalid date/);
    expect(() => migrate(doc({ startDate: "soon" }))).toThrow(/invalid date/);
    expect(() => migrate(doc({ amount: 0 }))).toThrow(/invalid amount/);
    expect(() => migrate(doc({ paused: "no" }))).toThrow(/paused/);
    expect(() => migrate(doc({ id: "" }))).toThrow(/no id/);
  });

  it("checks budgets", () => {
    expect(() => migrate({ version: 2, transactions: [] })).toThrow(/Budgets/);
    expect(() => migrate({ version: 2, transactions: [], budgets: { dining: -5 } })).toThrow(
      /dining/,
    );
    expect(() => migrate({ version: 2, transactions: [], budgets: { dining: 10.5 } })).toThrow(
      DataError,
    );
  });

  it("keeps a __proto__ key as plain data", () => {
    const data = migrate(
      JSON.parse('{"version":3,"transactions":[],"budgets":{"__proto__":100},"recurring":[]}'),
    );
    expect(Object.getPrototypeOf(data.budgets)).toBe(Object.prototype);
    expect(Object.keys(data.budgets)).toEqual(["__proto__"]);
  });

  it("rejects documents that are not app data", () => {
    expect(() => migrate(null)).toThrow(DataError);
    expect(() => migrate([])).toThrow(DataError);
    expect(() => migrate({ transactions: [] })).toThrow(/schema version/);
    expect(() => migrate({ version: 1 })).toThrow(/missing/);
  });

  it("refuses data from a newer version instead of guessing", () => {
    expect(() => migrate({ version: SCHEMA_VERSION + 1, transactions: [] })).toThrow(/newer/);
  });

  it("names the entry that is broken", () => {
    const entry = { id: "x", kind: "expense", amount: 100, category: "dining", date: "2026-10-01" };
    expect(() => migrate({ version: 1, transactions: [entry, { ...entry, amount: 1.5 }] })).toThrow(
      "Entry 2 has an invalid amount",
    );
    expect(() => migrate({ version: 1, transactions: [{ ...entry, date: "2026-02-30" }] })).toThrow(
      /invalid date/,
    );
    expect(() => migrate({ version: 1, transactions: [{ ...entry, kind: "refund" }] })).toThrow(
      /unknown type/,
    );
  });

  it("fills in a missing note and drops unknown fields", () => {
    const data = migrate({
      version: 1,
      transactions: [
        { id: "x", kind: "expense", amount: 100, category: "dining", date: "2026-10-01", extra: 1 },
      ],
    });
    expect(data.transactions[0]).toEqual({
      id: "x",
      kind: "expense",
      amount: 100,
      category: "dining",
      date: "2026-10-01",
      note: "",
    });
  });
});
