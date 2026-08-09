import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, localeDir, localeFromSetting, pickLocale } from ".";

describe("isLocale", () => {
  it("accepts the two supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fa")).toBe(true);
  });

  it("rejects anything else, including casing variants and non-strings", () => {
    expect(isLocale("EN")).toBe(false);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("localeDir", () => {
  it("maps fa to rtl and en to ltr", () => {
    expect(localeDir("fa")).toBe("rtl");
    expect(localeDir("en")).toBe("ltr");
  });
});

describe("localeFromSetting", () => {
  it("lowercases the stored Settings value", () => {
    expect(localeFromSetting("EN")).toBe("en");
    expect(localeFromSetting("FA")).toBe("fa");
  });

  it("falls back to the default locale for unknown or missing values", () => {
    expect(localeFromSetting("DE")).toBe(DEFAULT_LOCALE);
    expect(localeFromSetting("")).toBe(DEFAULT_LOCALE);
    expect(localeFromSetting(undefined)).toBe(DEFAULT_LOCALE);
    expect(localeFromSetting(42)).toBe(DEFAULT_LOCALE);
  });
});

describe("pickLocale", () => {
  it("returns the English value on the English tree", () => {
    expect(pickLocale("en", "Engine Oil", "روغن موتور")).toBe("Engine Oil");
  });

  it("returns the Persian value on the Persian tree", () => {
    expect(pickLocale("fa", "Engine Oil", "روغن موتور")).toBe("روغن موتور");
  });

  // The case that matters: Persian content lags English, so an untranslated
  // field must render the English text, never an empty string.
  it("falls back to English when the Persian value is missing", () => {
    expect(pickLocale("fa", "Engine Oil", "")).toBe("Engine Oil");
    expect(pickLocale("fa", "Engine Oil", null)).toBe("Engine Oil");
    expect(pickLocale("fa", "Engine Oil", undefined)).toBe("Engine Oil");
  });

  it("treats a whitespace-only Persian value as untranslated", () => {
    expect(pickLocale("fa", "Engine Oil", "   ")).toBe("Engine Oil");
    expect(pickLocale("fa", "Engine Oil", "\n\t")).toBe("Engine Oil");
  });

  it("never falls back the other way — an empty English value stays empty", () => {
    expect(pickLocale("en", "", "روغن موتور")).toBe("");
  });

  // Optional pairs (metaTitleEn/metaTitleFa) are nullable on both sides.
  it("normalizes a missing optional pair to null", () => {
    expect(pickLocale("en", null, null)).toBeNull();
    expect(pickLocale("fa", undefined, null)).toBeNull();
    expect(pickLocale("fa", null, "عنوان")).toBe("عنوان");
  });
});
