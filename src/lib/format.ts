import { parseLocalDate } from "./dates";

/** "October 2026", or "October" without the year. */
export function formatMonth(month: string, locale: string, withYear = true): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: withYear ? "numeric" : undefined,
  }).format(parseLocalDate(`${month}-01`));
}

/** "1 Nov", with the year only when it differs from `today`'s. */
export function formatDay(date: string, locale: string, today: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  }).format(parseLocalDate(date));
}

export function formatWeekday(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(parseLocalDate(date));
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
}
