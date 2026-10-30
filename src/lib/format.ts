import { parseLocalDate } from "./dates";

/** "October 2026", or "October" without the year. */
export function formatMonth(month: string, locale: string, withYear = true): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: withYear ? "numeric" : undefined,
  }).format(parseLocalDate(`${month}-01`));
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
}
