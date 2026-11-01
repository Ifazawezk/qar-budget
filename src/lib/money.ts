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
 * Some phone keypads offer a comma as their decimal key, so a lone comma before at most
 * two final digits is a decimal mark: "45,50" is 45.50, never 4550. Any other comma has to
 * sit before three digits, as in "1,250" or "1,25,000". The rest could mean two different
 * amounts, so they come back null and the person is asked to check them.
 */
function dropSeparators(text: string): string | null {
  if (/^[^,.٬]*,\d{0,2}$/.test(text)) return text.replace(",", ".");
  if (/[,٬]\d{0,2}(\.|$)/.test(text)) return null;
  return text.replace(/[,٬]/g, "");
}

/**
 * Read an amount the way people type it: "45", "45.5", "45,50", "1,250.75", "١٢٥٫٥".
 * Returns dirhams, or null when the text is not a non-negative amount
 * with at most two decimals.
 */
export function parseAmount(input: string): Dirhams | null {
  const text = dropSeparators(
    toLatinDigits(input)
      .replace(/٫/g, ".") // Arabic decimal separator
      .replace(/،/g, ",") // Arabic comma
      .replace(/\s/g, ""),
  );
  if (text === null) return null;
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

function formatter(locale: string, signed: boolean): Intl.NumberFormat {
  const key = `${locale}|${signed}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "QAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: signed ? "exceptZero" : "auto",
    });
    formatters.set(key, cached);
  }
  return cached;
}

/** Format for display with the locale's own digits and currency sign. */
export function formatQAR(amount: Dirhams, locale = "en-QA"): string {
  return formatter(locale, false).format(amount / 100);
}

/** Like formatQAR but always shows + or -, placed where the locale expects it. */
export function formatSigned(amount: Dirhams, locale = "en-QA"): string {
  return formatter(locale, true).format(amount / 100);
}
