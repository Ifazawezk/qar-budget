import type { Kind } from "./types";

export interface Category {
  id: string;
  kind: Kind;
  name: { en: string };
}

// Ids are stored in saved data and CSV files, so they must never change.
// Names can be reworded freely.
export const CATEGORIES: readonly Category[] = [
  { id: "salary", kind: "income", name: { en: "Salary" } },
  { id: "allowance", kind: "income", name: { en: "Allowances" } },
  { id: "freelance", kind: "income", name: { en: "Freelance" } },
  { id: "other-income", kind: "income", name: { en: "Other income" } },
  { id: "housing", kind: "expense", name: { en: "Rent and housing" } },
  { id: "groceries", kind: "expense", name: { en: "Groceries" } },
  { id: "dining", kind: "expense", name: { en: "Eating out" } },
  { id: "transport", kind: "expense", name: { en: "Transport and fuel" } },
  { id: "bills", kind: "expense", name: { en: "Bills and phone" } },
  { id: "remittance", kind: "expense", name: { en: "Money sent home" } },
  { id: "health", kind: "expense", name: { en: "Health" } },
  { id: "education", kind: "expense", name: { en: "Education" } },
  { id: "shopping", kind: "expense", name: { en: "Shopping" } },
  { id: "entertainment", kind: "expense", name: { en: "Entertainment" } },
  { id: "travel", kind: "expense", name: { en: "Travel" } },
  { id: "other-expense", kind: "expense", name: { en: "Other" } },
];

export function categoriesFor(kind: Kind): Category[] {
  return CATEGORIES.filter((c) => c.kind === kind);
}

export function categoryName(id: string): string {
  // Imported files may contain ids this version does not know; show them as they are.
  return CATEGORIES.find((c) => c.id === id)?.name.en ?? id;
}
