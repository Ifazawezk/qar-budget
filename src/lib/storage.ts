import { isValidDate } from "./dates";
import type { Lang } from "./i18n";
import type { AppData, Budgets, Kind, RecurringRule, Transaction } from "./types";

export const STORAGE_KEY = "qar-budget:data";
export const BACKUP_KEY = "qar-budget:backup";
export const SCHEMA_VERSION = 3;

/** The part of the Web Storage API used here, so tests can pass a simple fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataError";
  }
}

type Doc = Record<string, unknown>;

/**
 * Upgrades for older saved data: MIGRATIONS[n] turns a version n document
 * into version n + 1. Released steps must never change; add a new one instead.
 */
const MIGRATIONS: Record<number, (doc: Doc) => Doc> = {
  // 1 -> 2: monthly budgets per category.
  1: (doc) => ({ ...doc, version: 2, budgets: {} }),
  // 2 -> 3: recurring entries.
  2: (doc) => ({ ...doc, version: 3, recurring: [] }),
};

function isRecord(value: unknown): value is Doc {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyData(): AppData {
  return { transactions: [], budgets: {}, recurring: [] };
}

function readBudgets(raw: unknown): Budgets {
  if (!isRecord(raw)) throw new DataError("Budgets are missing");
  const entries = Object.entries(raw);
  for (const [category, limit] of entries) {
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0) {
      throw new DataError(`Budget for "${category}" is invalid`);
    }
  }
  // fromEntries defines plain own properties, so a "__proto__" key stays harmless.
  return Object.fromEntries(entries) as Budgets;
}

interface EntryFields {
  id: string;
  kind: Kind;
  amount: number;
  category: string;
  note: string;
}

/** The fields an entry and a recurring rule share. */
function readEntryFields(raw: unknown, where: string): EntryFields & Doc {
  if (!isRecord(raw)) throw new DataError(`${where} is not an object`);
  const { id, kind, amount, category } = raw;
  const note = raw.note ?? "";
  if (typeof id !== "string" || id === "") throw new DataError(`${where} has no id`);
  if (kind !== "income" && kind !== "expense") throw new DataError(`${where} has an unknown type`);
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new DataError(`${where} has an invalid amount`);
  }
  if (typeof category !== "string" || category === "") {
    throw new DataError(`${where} has no category`);
  }
  if (typeof note !== "string") throw new DataError(`${where} has an invalid note`);
  return { ...raw, id, kind, amount, category, note };
}

function readDate(value: unknown, where: string): string {
  if (typeof value !== "string" || !isValidDate(value)) {
    throw new DataError(`${where} has an invalid date`);
  }
  return value;
}

function readTransaction(raw: unknown, index: number): Transaction {
  const where = `Entry ${index + 1}`;
  const { id, kind, amount, category, note, date } = readEntryFields(raw, where);
  return { id, kind, amount, category, date: readDate(date, where), note };
}

function readRule(raw: unknown, index: number): RecurringRule {
  const where = `Recurring entry ${index + 1}`;
  const fields = readEntryFields(raw, where);
  const { id, kind, amount, category, note, frequency, paused } = fields;
  if (frequency !== "monthly" && frequency !== "weekly") {
    throw new DataError(`${where} has an unknown frequency`);
  }
  if (typeof paused !== "boolean") throw new DataError(`${where} has an invalid paused state`);
  return {
    id,
    kind,
    amount,
    category,
    note,
    frequency,
    startDate: readDate(fields.startDate, where),
    nextDue: readDate(fields.nextDue, where),
    paused,
  };
}

function validate(doc: Doc): AppData {
  if (!Array.isArray(doc.transactions)) throw new DataError("The list of entries is missing");
  if (!Array.isArray(doc.recurring)) throw new DataError("The list of recurring entries is missing");
  return {
    transactions: doc.transactions.map(readTransaction),
    budgets: readBudgets(doc.budgets),
    recurring: doc.recurring.map(readRule),
  };
}

/** Check a saved or imported document and bring it up to the current schema. */
export function migrate(raw: unknown): AppData {
  if (!isRecord(raw)) throw new DataError("Not a qar-budget data file");
  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new DataError("Missing or invalid schema version");
  }
  if (version > SCHEMA_VERSION) {
    throw new DataError(`Saved by a newer version of the app (schema ${version})`);
  }
  let doc = raw;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new DataError(`No upgrade from schema ${v}`);
    doc = step(doc);
  }
  return validate(doc);
}

export function serialize(data: AppData): string {
  return JSON.stringify({ version: SCHEMA_VERSION, ...data });
}

export interface LoadResult {
  data: AppData;
  /** Set when saved data existed but could not be read. */
  problem: string | null;
}

export function load(store: KeyValueStore): LoadResult {
  const text = store.getItem(STORAGE_KEY);
  if (text === null) return { data: emptyData(), problem: null };
  try {
    return { data: migrate(JSON.parse(text)), problem: null };
  } catch (error) {
    // Keep the unreadable copy so a bad release can never silently wipe someone's records.
    store.setItem(BACKUP_KEY, text);
    return { data: emptyData(), problem: error instanceof Error ? error.message : String(error) };
  }
}

export function save(store: KeyValueStore, data: AppData): void {
  store.setItem(STORAGE_KEY, serialize(data));
}

// Display preferences live under their own key. They are not part of exports,
// and unknown values simply fall back to the defaults, so they need no versioning.
export const SETTINGS_KEY = "qar-budget:settings";

export type Theme = "auto" | "light" | "dark";

export interface Settings {
  theme: Theme;
  lang: Lang;
}

/** `fallbackLang` is used until the user picks a language, usually the browser's. */
export function loadSettings(store: KeyValueStore, fallbackLang: Lang = "en"): Settings {
  let raw: unknown = null;
  try {
    raw = JSON.parse(store.getItem(SETTINGS_KEY) ?? "null");
  } catch {
    // Ignore and use defaults.
  }
  const saved = isRecord(raw) ? raw : {};
  const theme = saved.theme === "light" || saved.theme === "dark" ? saved.theme : "auto";
  const lang = saved.lang === "en" || saved.lang === "ar" ? saved.lang : fallbackLang;
  return { theme, lang };
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
