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
};

describe("load and save", () => {
  it("starts empty when nothing is saved", () => {
    expect(load(new MemoryStore())).toEqual({ data: { transactions: [] }, problem: null });
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
});

describe("settings", () => {
  it("falls back to defaults for missing or unknown values", () => {
    const store = new MemoryStore();
    expect(loadSettings(store)).toEqual({ theme: "auto" });
    store.setItem(SETTINGS_KEY, '{"theme":"purple"}');
    expect(loadSettings(store)).toEqual({ theme: "auto" });
    store.setItem(SETTINGS_KEY, "oops");
    expect(loadSettings(store)).toEqual({ theme: "auto" });
  });

  it("saves and loads the theme", () => {
    const store = new MemoryStore();
    saveSettings(store, { theme: "dark" });
    expect(loadSettings(store)).toEqual({ theme: "dark" });
  });
});

describe("migrate", () => {
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
