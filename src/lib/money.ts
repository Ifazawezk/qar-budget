/**
 * Money is kept as a whole number of dirhams (1 QAR = 100 dirhams).
 * Integers add up exactly, so totals never drift the way 0.1 + 0.2 does.
 */
export type Dirhams = number;

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Read an amount the way people type it: "45", "45.5", "1,250.75", "١٢٥٫٥".
 * Returns dirhams, or null when the text is not a non-negative amount
 * with at most two decimals.
 */
export function parseAmount(input: string): Dirhams | null {
  const text = toLatinDigits(input.trim())
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[,٬\s]/g, ""); // thousands separators
  const match = /^(?=\d|\.\d)(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1] ?? "");
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const amount = whole * 100 + fraction;
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Plain decimal text for form fields and files: 125050 -> "1250.50". */
export function toDecimal(amount: Dirhams): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Format for display with the locale's own digits and currency sign. */
export function formatQAR(amount: Dirhams, locale = "en-QA"): string {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "QAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(amount / 100);
}
