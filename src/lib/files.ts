import { type CsvIssue, toCSV, transactionsFromCSV } from "./csv";
import { today } from "./dates";
import { DataError, migrate, SCHEMA_VERSION } from "./storage";
import { mergeTransactions } from "./transactions";
import type { AppData } from "./types";

/** A full backup. It is the saved document plus a little metadata, so importing it runs the same migrations. */
export function exportJSON(data: AppData, now = new Date()): string {
  return JSON.stringify(
    { app: "qar-budget", version: SCHEMA_VERSION, exportedAt: now.toISOString(), ...data },
    null,
    2,
  );
}

/** CSV with a byte order mark, so Excel reads Arabic notes as UTF-8. */
export function exportCSV(data: AppData): string {
  return `﻿${toCSV(data.transactions)}`;
}

export function exportFileName(extension: "json" | "csv", now = new Date()): string {
  return `qar-budget-${today(now)}.${extension}`;
}

export interface ImportResult {
  data: AppData;
  added: number;
  updated: number;
  skipped: number;
  /** Rows a CSV file had to skip. Always empty for JSON, which is all or nothing. */
  issues: CsvIssue[];
}

/**
 * Merge an imported JSON backup or CSV file into the current data.
 * Throws DataError when the file cannot be used at all.
 */
export function importFile(
  current: AppData,
  fileName: string,
  text: string,
  makeId: () => string,
): ImportResult {
  const looksLikeJson = /\.json$/i.test(fileName) || /^\s*[{[]/.test(text.replace(/^﻿/, ""));

  if (looksLikeJson) {
    let raw: unknown;
    try {
      raw = JSON.parse(text.replace(/^﻿/, ""));
    } catch {
      throw new DataError("The file is not valid JSON");
    }
    const incoming = migrate(raw);
    const merged = mergeTransactions(current.transactions, incoming.transactions);
    return {
      data: {
        transactions: merged.transactions,
        budgets: { ...current.budgets, ...incoming.budgets },
      },
      added: merged.added,
      updated: merged.updated,
      skipped: merged.skipped,
      issues: [],
    };
  }

  const { transactions, issues } = transactionsFromCSV(text, makeId);
  if (issues.some((issue) => issue.field === "columns")) {
    throw new DataError("The CSV file needs date, type, category and amount columns");
  }
  const merged = mergeTransactions(current.transactions, transactions);
  return {
    data: { ...current, transactions: merged.transactions },
    added: merged.added,
    updated: merged.updated,
    skipped: merged.skipped,
    issues,
  };
}
