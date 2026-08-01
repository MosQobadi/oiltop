import { z } from "zod";

// Raw key/value row shape, as persisted in the Setting table.
export const settingsSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(2000),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

// Every setting the admin UI reads/writes is one of these known keys. The
// Setting table itself is a generic key/value store, so this map is what
// keeps the PATCH endpoint from persisting arbitrary, unrecognized keys.
export const SETTINGS_KEYS = {
  general: {
    storeName: "general.storeName",
    supportEmail: "general.supportEmail",
    supportPhone: "general.supportPhone",
    socialLinks: "general.socialLinks",
  },
  seo: {
    metaTitleTemplate: "seo.metaTitleTemplate",
    metaDescription: "seo.metaDescription",
    googleSearchConsoleCode: "seo.googleSearchConsoleCode",
    sitemapEnabled: "seo.sitemapEnabled",
  },
  localization: {
    defaultLocale: "localization.defaultLocale",
    supportedLocales: "localization.supportedLocales",
  },
  shipping: {
    flatRateFee: "shipping.flatRateFee",
    freeShippingThreshold: "shipping.freeShippingThreshold",
  },
  payment: {
    enabledMethods: "payment.enabledMethods",
  },
} as const;

const KNOWN_SETTINGS_KEYS = new Set<string>(
  Object.values(SETTINGS_KEYS).flatMap((group) => Object.values(group)),
);

// PATCH body: a partial key/value object, upserted key by key.
export const settingsPatchSchema = z
  .record(z.string(), z.string().max(2000))
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one setting must be provided",
  })
  .refine((obj) => Object.keys(obj).every((key) => KNOWN_SETTINGS_KEYS.has(key)), {
    message: "Unknown setting key",
  });

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;

export const LOCALES = ["EN", "FA"] as const;
export type Locale = (typeof LOCALES)[number];

export const PAYMENT_METHODS = [
  { value: "COD", label: "Cash on Delivery" },
  { value: "CARD", label: "Credit/Debit Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
] as const;

// Client-side (and server-side, on save) shape for each Settings tab.

export const generalSettingsSchema = z.object({
  storeName: z.string().min(1, "Store name is required").max(200),
  supportEmail: z.string().email("Enter a valid email"),
  supportPhone: z.string().min(1, "Support phone is required").max(50),
  socialLinks: z.record(z.string(), z.string()).nullable(),
});
export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;

export const seoSettingsSchema = z.object({
  metaTitleTemplate: z.string().max(200),
  metaDescription: z.string().max(500),
  googleSearchConsoleCode: z.string().max(200),
  sitemapEnabled: z.boolean(),
});
export type SeoSettingsInput = z.infer<typeof seoSettingsSchema>;

export const localizationSettingsSchema = z.object({
  defaultLocale: z.enum(LOCALES),
  supportedLocales: z.array(z.enum(LOCALES)).min(1, "Select at least one locale"),
});
export type LocalizationSettingsInput = z.infer<typeof localizationSettingsSchema>;

export const shippingSettingsSchema = z.object({
  flatRateFee: z.coerce.number().min(0, "Must be 0 or greater"),
  freeShippingThreshold: z.coerce.number().min(0, "Must be 0 or greater"),
});
export type ShippingSettingsInput = z.infer<typeof shippingSettingsSchema>;

export const paymentSettingsSchema = z.object({
  enabledMethods: z.array(z.string()),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;
