import { describe, expect, it } from "vitest";
import {
  SETTINGS_KEYS,
  generalSettingsSchema,
  localizationSettingsSchema,
  paymentSettingsSchema,
  seoSettingsSchema,
  settingsPatchSchema,
  settingsSchema,
  shippingSettingsSchema,
} from "./settings";

describe("settingsSchema", () => {
  it("accepts a valid key/value pair", () => {
    expect(settingsSchema.safeParse({ key: "site_name", value: "Top Oil" }).success).toBe(true);
  });

  it("rejects an empty key", () => {
    expect(settingsSchema.safeParse({ key: "", value: "Top Oil" }).success).toBe(false);
  });
});

describe("settingsPatchSchema", () => {
  it("accepts a partial object of known keys", () => {
    const result = settingsPatchSchema.safeParse({
      [SETTINGS_KEYS.general.storeName]: "Top Oil",
      [SETTINGS_KEYS.seo.sitemapEnabled]: "true",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an unknown key", () => {
    const result = settingsPatchSchema.safeParse({ "not.a.real.key": "value" });
    expect(result.success).toBe(false);
  });
});

describe("generalSettingsSchema", () => {
  it("accepts valid general settings", () => {
    const result = generalSettingsSchema.safeParse({
      storeName: "Top Oil",
      supportEmail: "support@topoil.com",
      supportPhone: "0912 000 0000",
      socialLinks: { instagram: "https://instagram.com/topoil" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = generalSettingsSchema.safeParse({
      storeName: "Top Oil",
      supportEmail: "not-an-email",
      supportPhone: "0912 000 0000",
      socialLinks: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("seoSettingsSchema", () => {
  it("accepts valid seo settings", () => {
    const result = seoSettingsSchema.safeParse({
      metaTitleTemplate: "%s | Top Oil",
      metaDescription: "Engine oils and filters.",
      googleSearchConsoleCode: "abc123",
      sitemapEnabled: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("localizationSettingsSchema", () => {
  it("accepts EN/FA locales", () => {
    const result = localizationSettingsSchema.safeParse({
      defaultLocale: "EN",
      supportedLocales: ["EN", "FA"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty supportedLocales list", () => {
    const result = localizationSettingsSchema.safeParse({
      defaultLocale: "EN",
      supportedLocales: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported locale", () => {
    const result = localizationSettingsSchema.safeParse({
      defaultLocale: "DE",
      supportedLocales: ["EN"],
    });
    expect(result.success).toBe(false);
  });
});

describe("shippingSettingsSchema", () => {
  it("accepts non-negative numeric fees", () => {
    const result = shippingSettingsSchema.safeParse({
      flatRateFee: "150000",
      freeShippingThreshold: 1_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative fee", () => {
    const result = shippingSettingsSchema.safeParse({
      flatRateFee: -1,
      freeShippingThreshold: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("paymentSettingsSchema", () => {
  it("accepts a list of enabled methods", () => {
    const result = paymentSettingsSchema.safeParse({ enabledMethods: ["COD", "CARD"] });
    expect(result.success).toBe(true);
  });

  it("accepts an empty list (all methods disabled)", () => {
    const result = paymentSettingsSchema.safeParse({ enabledMethods: [] });
    expect(result.success).toBe(true);
  });
});
