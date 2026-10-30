import { describe, expect, it } from "vitest";
import { formatQAR, formatSigned, parseAmount, toDecimal } from "./money";

describe("parseAmount", () => {
  it("reads whole and decimal amounts as dirhams", () => {
    expect(parseAmount("45")).toBe(4500);
    expect(parseAmount("45.5")).toBe(4550);
    expect(parseAmount("45.05")).toBe(4505);
    expect(parseAmount(".75")).toBe(75);
    expect(parseAmount("12.")).toBe(1200);
  });

  it("does not pick up floating point noise", () => {
    expect(parseAmount("0.29")).toBe(29);
    expect(parseAmount("1.15")).toBe(115);
  });

  it("ignores thousands separators and spaces", () => {
    expect(parseAmount(" 1,250.75 ")).toBe(125075);
    expect(parseAmount("12 500")).toBe(1250000);
  });

  it("accepts Arabic-Indic digits and separators", () => {
    expect(parseAmount("١٢٥٫٥")).toBe(12550);
    expect(parseAmount("٣٬٥٠٠")).toBe(350000);
    expect(parseAmount("۴۵")).toBe(4500);
  });

  it("rejects anything that is not a plain amount", () => {
    for (const bad of ["", ".", "abc", "12abc", "-5", "1.234", "1e5", "QAR 5"]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
});

describe("toDecimal", () => {
  it("writes dirhams back as a decimal string", () => {
    expect(toDecimal(125050)).toBe("1250.50");
    expect(toDecimal(5)).toBe("0.05");
    expect(toDecimal(0)).toBe("0.00");
    expect(toDecimal(-1999)).toBe("-19.99");
  });

  it("round-trips with parseAmount", () => {
    for (const amount of [1, 99, 100, 4550, 123456789]) {
      expect(parseAmount(toDecimal(amount))).toBe(amount);
    }
  });
});

describe("formatQAR", () => {
  // Intl puts a non-breaking space between the code and the number.
  const plain = (text: string) => text.replace(/\s/g, " ");

  it("formats in English with the QAR code", () => {
    expect(plain(formatQAR(123450, "en-QA"))).toBe("QAR 1,234.50");
    expect(plain(formatQAR(5000))).toBe("QAR 50.00");
  });

  it("shows a sign for income and expenses", () => {
    expect(plain(formatSigned(150000))).toBe("+QAR 1,500.00");
    expect(plain(formatSigned(-4550))).toBe("-QAR 45.50");
    expect(plain(formatSigned(0))).toBe("QAR 0.00");
  });

  it("formats in Arabic with the riyal sign", () => {
    const text = formatQAR(123450, "ar-QA");
    expect(text).toContain("ر.ق");
    expect(text).toMatch(/1,234\.50|١٬٢٣٤٫٥٠/);
  });
});
