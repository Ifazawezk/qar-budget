import { describe, expect, it } from "vitest";
import { localeFor, MESSAGE_KEYS, preferredLang, translator } from "./i18n";

function placeholders(text: string): string[] {
  return (text.match(/\{\w+\}/g) ?? []).sort();
}

describe("translations", () => {
  const en = translator("en");
  const ar = translator("ar");

  it("uses the same placeholders in both languages", () => {
    for (const key of MESSAGE_KEYS) {
      expect(placeholders(ar(key)), key).toEqual(placeholders(en(key)));
    }
  });

  it("has real Arabic text for every message that is not a brand or format name", () => {
    const latinByDesign = new Set(["switchLang", "exportJson", "exportCsv"]);
    for (const key of MESSAGE_KEYS) {
      if (!latinByDesign.has(key)) expect(ar(key), key).toMatch(/[؀-ۿ]/);
    }
  });
});

describe("translator", () => {
  it("fills in placeholders", () => {
    const t = translator("en");
    expect(t("noEntriesMonth", { month: "October 2026" })).toBe("No entries in October 2026.");
    expect(translator("ar")("overBy", { amount: "٥٠ ر.ق" })).toBe("تجاوز الحد بمقدار ٥٠ ر.ق");
  });

  it("leaves unknown placeholders visible instead of hiding a bug", () => {
    expect(translator("en")("overBy")).toBe("Over by {amount}");
  });
});

describe("language choice", () => {
  it("picks Arabic only when the browser asks for it first", () => {
    expect(preferredLang(["ar-QA", "en-US"])).toBe("ar");
    expect(preferredLang(["AR"])).toBe("ar");
    expect(preferredLang(["en-GB", "ar"])).toBe("en");
    expect(preferredLang([])).toBe("en");
  });

  it("formats numbers for Qatar", () => {
    expect(localeFor("en")).toBe("en-QA");
    expect(localeFor("ar")).toBe("ar-QA");
  });
});
