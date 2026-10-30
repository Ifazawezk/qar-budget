import { describe, expect, it } from "vitest";
import { localeFor, preferredLang, translator } from "./i18n";

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
