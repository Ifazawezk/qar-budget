import { describe, expect, it } from "vitest";
import { parseCSV, toCSV, transactionsFromCSV } from "./csv";
import type { Transaction } from "./types";

function counter(): () => string {
  let n = 0;
  return () => `id${++n}`;
}

const entries: Transaction[] = [
  { id: "b", kind: "expense", amount: 4550, category: "groceries", date: "2026-10-03", note: "Lulu, weekly" },
  { id: "a", kind: "income", amount: 1500000, category: "salary", date: "2026-10-01", note: "" },
  { id: "c", kind: "expense", amount: 1200, category: "dining", date: "2026-10-05", note: 'Said "thanks"\nand left' },
  { id: "d", kind: "expense", amount: 500, category: "other-expense", date: "2026-10-06", note: "=SUM(A1:A9)" },
  { id: "e", kind: "expense", amount: 2000, category: "dining", date: "2026-10-07", note: "-5 discount" },
  { id: "f", kind: "expense", amount: 3000, category: "groceries", date: "2026-10-08", note: "كرك وشاي" },
];

describe("toCSV", () => {
  const csv = toCSV(entries);
  const lines = csv.split("\r\n");

  it("writes a header and one row per entry, oldest first", () => {
    expect(lines[0]).toBe("date,type,category,amount,note");
    expect(lines[1]).toBe("2026-10-01,income,salary,15000.00,");
    expect(lines[2]).toBe('2026-10-03,expense,groceries,45.50,"Lulu, weekly"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes newlines and doubles quotes", () => {
    expect(csv).toContain('"Said ""thanks""\nand left"');
  });

  it("stops spreadsheets from running notes as formulas", () => {
    expect(csv).toContain(",'=SUM(A1:A9)");
    expect(csv).toContain(",'-5 discount");
  });
});

describe("parseCSV", () => {
  it("handles quotes, CRLF and a byte order mark", () => {
    const rows = parseCSV('﻿a,b\r\n"1,5","say ""hi"""\r\n');
    expect(rows).toEqual([
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ["1,5", 'say "hi"'] },
    ]);
  });

  it("keeps line numbers right when a quoted cell spans lines", () => {
    const rows = parseCSV('a\n"x\ny"\nz');
    expect(rows.map((r) => r.line)).toEqual([1, 2, 4]);
    expect(rows[1]?.cells).toEqual(["x\ny"]);
  });

  it("keeps empty cells", () => {
    expect(parseCSV("a,,c\n,")).toEqual([
      { line: 1, cells: ["a", "", "c"] },
      { line: 2, cells: ["", ""] },
    ]);
  });
});

describe("transactionsFromCSV", () => {
  it("round-trips everything toCSV writes", () => {
    const { transactions, issues } = transactionsFromCSV(toCSV(entries), counter());
    expect(issues).toEqual([]);
    const strip = ({ id: _id, ...rest }: Transaction) => rest;
    const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date);
    expect(transactions.map(strip)).toEqual([...entries].sort(byDate).map(strip));
  });

  it("finds columns by name in any order and ignores extra ones", () => {
    const csv = "Amount,Note,Category,Type,Date,Account\n12.5,taxi,transport,EXPENSE,2026-10-02,cash\n";
    expect(transactionsFromCSV(csv, counter()).transactions).toEqual([
      { id: "id1", kind: "expense", amount: 1250, category: "transport", date: "2026-10-02", note: "taxi" },
    ]);
  });

  it("skips bad rows and says which line and value was wrong", () => {
    const csv = [
      "date,type,category,amount",
      "2026-10-01,expense,dining,20",
      "2026-13-01,expense,dining,20",
      "2026-10-02,refund,dining,20",
      "2026-10-03,expense,,20",
      "2026-10-04,expense,dining,abc",
      "2026-10-05,expense,dining,0",
      "",
      "2026-10-06,income,salary,\"1,000\"",
    ].join("\n");
    const { transactions, issues } = transactionsFromCSV(csv, counter());
    expect(transactions.map((t) => t.amount)).toEqual([2000, 100000]);
    expect(issues).toEqual([
      { line: 3, field: "date" },
      { line: 4, field: "type" },
      { line: 5, field: "category" },
      { line: 6, field: "amount" },
      { line: 7, field: "amount" },
    ]);
  });

  it("reports a missing column instead of guessing", () => {
    expect(transactionsFromCSV("date,amount\n2026-10-01,5", counter())).toEqual({
      transactions: [],
      issues: [{ line: 1, field: "columns" }],
    });
    expect(transactionsFromCSV("", counter()).issues).toEqual([{ line: 1, field: "columns" }]);
  });
});
