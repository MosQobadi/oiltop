import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, localeDir, localeFromSetting } from "./i18n";

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
