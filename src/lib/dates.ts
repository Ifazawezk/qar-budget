// Dates are stored as "YYYY-MM-DD" in the user's local time and months as "YYYY-MM".
// Plain strings sort correctly and avoid time zone surprises: Qatar is UTC+3,
// so toISOString() would report yesterday for anything entered before 3 am.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isValidDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isValidMonth(value: string): boolean {
  const match = MONTH_RE.exec(value);
  return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12;
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight local time on the given YYYY-MM-DD date, for Intl formatting. */
export function parseLocalDate(date: string): Date {
  return new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

export function today(now = new Date()): string {
  return toISODate(now);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function currentMonth(now = new Date()): string {
  return monthOf(today(now));
}

/** shiftMonth("2026-01", -1) === "2025-12" */
export function shiftMonth(month: string, delta: number): string {
  if (!isValidMonth(month)) throw new RangeError(`Invalid month: ${month}`);
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${pad((index % 12) + 1)}`;
}

export function daysInMonth(month: string): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

/** The given day of a month, or the month's last day when the month is shorter. */
export function dayOfMonth(month: string, day: number): string {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

/** Counts in UTC, so a clock change in the browser's time zone cannot skip a day. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + days),
  );
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  return `${year}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
