import type { Lang } from "./i18n";
import type { Kind } from "./types";

export interface Category {
  id: string;
  kind: Kind;
  name: Record<Lang, string>;
}

// Ids are stored in saved data and CSV files, so they must never change.
// Names can be reworded freely.
export const CATEGORIES: readonly Category[] = [
  { id: "salary", kind: "income", name: { en: "Salary", ar: "الراتب" } },
  { id: "allowance", kind: "income", name: { en: "Allowances", ar: "البدلات" } },
  { id: "freelance", kind: "income", name: { en: "Freelance", ar: "عمل حر" } },
  { id: "other-income", kind: "income", name: { en: "Other income", ar: "دخل آخر" } },
  { id: "housing", kind: "expense", name: { en: "Rent and housing", ar: "السكن والإيجار" } },
  { id: "groceries", kind: "expense", name: { en: "Groceries", ar: "البقالة" } },
  { id: "dining", kind: "expense", name: { en: "Eating out", ar: "المطاعم والمقاهي" } },
  { id: "transport", kind: "expense", name: { en: "Transport and fuel", ar: "المواصلات والوقود" } },
  { id: "bills", kind: "expense", name: { en: "Bills and phone", ar: "الفواتير والاتصالات" } },
  { id: "remittance", kind: "expense", name: { en: "Money sent home", ar: "تحويلات للأهل" } },
  { id: "health", kind: "expense", name: { en: "Health", ar: "الصحة" } },
  { id: "education", kind: "expense", name: { en: "Education", ar: "التعليم" } },
  { id: "shopping", kind: "expense", name: { en: "Shopping", ar: "التسوق" } },
  { id: "entertainment", kind: "expense", name: { en: "Entertainment", ar: "الترفيه" } },
  { id: "travel", kind: "expense", name: { en: "Travel", ar: "السفر" } },
  { id: "other-expense", kind: "expense", name: { en: "Other", ar: "أخرى" } },
];

export function categoriesFor(kind: Kind): Category[] {
  return CATEGORIES.filter((c) => c.kind === kind);
}

export function categoryName(id: string, lang: Lang): string {
  // Imported files may contain ids this version does not know; show them as they are.
  return CATEGORIES.find((c) => c.id === id)?.name[lang] ?? id;
}
