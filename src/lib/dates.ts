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
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}
