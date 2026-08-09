import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  localeDir,
  localeFromSetting,
  pickLocale,
  switchLocalePath,
} from ".";

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

describe("switchLocalePath", () => {
  // The whole point of the switcher: you stay on the page you were reading.
  it("swaps the locale segment and keeps the rest of the path", () => {
    expect(switchLocalePath("/en/products/castrol-edge-5w30", "fa")).toBe(
      "/fa/products/castrol-edge-5w30",
    );
    expect(switchLocalePath("/fa/categories/engine-oil", "en")).toBe("/en/categories/engine-oil");
  });

  it("handles a bare locale root", () => {
    expect(switchLocalePath("/en", "fa")).toBe("/fa");
    expect(switchLocalePath("/fa", "en")).toBe("/en");
  });

  it("is a no-op when the target locale is already active", () => {
    expect(switchLocalePath("/en/cart", "en")).toBe("/en/cart");
  });

  it("preserves a trailing slash rather than rewriting the path shape", () => {
    expect(switchLocalePath("/en/cart/", "fa")).toBe("/fa/cart/");
  });

  it("prefixes the locale when the path has no locale segment", () => {
    expect(switchLocalePath("/", "fa")).toBe("/fa");
    expect(switchLocalePath("/products/x", "fa")).toBe("/fa/products/x");
    // "english" starts with "en" but isn't the segment — must not be truncated.
    expect(switchLocalePath("/english/x", "fa")).toBe("/fa/english/x");
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
