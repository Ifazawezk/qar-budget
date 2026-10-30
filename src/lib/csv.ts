import { isValidDate } from "./dates";
import { parseAmount, toDecimal } from "./money";
import type { Transaction } from "./types";

export const CSV_COLUMNS = ["date", "type", "category", "amount", "note"] as const;

// Excel and Google Sheets run a cell that starts with one of these as a formula.
// Exported cells get a leading apostrophe, which spreadsheets hide, and import strips it again.
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

/** Oldest first, one row per entry, CRLF line endings as RFC 4180 asks. */
export function toCSV(transactions: readonly Transaction[]): string {
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((tx) =>
      [tx.date, tx.kind, tx.category, toDecimal(tx.amount), tx.note].map(escapeCell).join(","),
    );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export interface CsvRow {
  /** Line in the file where the row starts, counting from 1. */
  line: number;
  cells: string[];
}

/** Split CSV text into rows. Handles quotes, escaped quotes, newlines inside quotes and a BOM. */
export function parseCSV(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows;
}

export type CsvField = "date" | "type" | "category" | "amount";

export interface CsvIssue {
  line: number;
  /** The value that was wrong, or "columns" when the header is missing a required column. */
  field: CsvField | "columns";
}

export interface CsvImport {
  transactions: Transaction[];
  issues: CsvIssue[];
}

/**
 * Read entries from CSV. Columns are found by their header names, so their order
 * does not matter and extra columns are ignored. Bad rows are skipped and reported.
 */
export function transactionsFromCSV(text: string, makeId: () => string): CsvImport {
  const rows = parseCSV(text).filter((row) => row.cells.some((c) => c.trim() !== ""));
  const header = rows.shift();
  if (!header) return { transactions: [], issues: [{ line: 1, field: "columns" }] };

  const names = header.cells.map((c) => c.trim().toLowerCase());
  const column = {
    date: names.indexOf("date"),
    type: names.indexOf("type"),
    category: names.indexOf("category"),
    amount: names.indexOf("amount"),
    note: names.indexOf("note"),
  };
  if (column.date < 0 || column.type < 0 || column.category < 0 || column.amount < 0) {
    return { transactions: [], issues: [{ line: header.line, field: "columns" }] };
  }

  const transactions: Transaction[] = [];
  const issues: CsvIssue[] = [];
  for (const { line, cells } of rows) {
    const get = (index: number) => (index < 0 ? "" : unescapeFormula((cells[index] ?? "").trim()));
    const date = get(column.date);
    const kind = get(column.type).toLowerCase();
    const category = get(column.category);
    const amount = parseAmount(get(column.amount));
    const skip = (field: CsvField) => issues.push({ line, field });

    if (!isValidDate(date)) skip("date");
    else if (kind !== "income" && kind !== "expense") skip("type");
    else if (category === "") skip("category");
    else if (amount === null || amount <= 0) skip("amount");
    else transactions.push({ id: makeId(), kind, amount, category, date, note: get(column.note) });
  }
  return { transactions, issues };
}
