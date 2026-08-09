import { prisma } from "@/lib/db";
import {
  SETTINGS_KEYS,
  type GeneralSettingsInput,
  type LocalizationSettingsInput,
  type PaymentSettingsInput,
  type SeoSettingsInput,
  type SettingsPatchInput,
  type ShippingSettingsInput,
} from "@/lib/validation";

export interface SettingsData {
  general: GeneralSettingsInput;
  seo: SeoSettingsInput;
  localization: LocalizationSettingsInput;
  shipping: ShippingSettingsInput;
  payment: PaymentSettingsInput;
}

// The subset of settings the public storefront is allowed to read. Deliberately
// a flat, hand-written shape rather than a filtered `SettingsData`: anything new
// the admin Settings screen gains stays private until it is added here on
// purpose. Shipping and payment never belong in it.
export interface PublicSettings {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  socialLinks: Record<string, string> | null;
  defaultLocale: LocalizationSettingsInput["defaultLocale"];
  supportedLocales: LocalizationSettingsInput["supportedLocales"];
}

const DEFAULTS: SettingsData = {
  general: {
    storeName: "",
    supportEmail: "",
    supportPhone: "",
    socialLinks: null,
  },
  seo: {
    metaTitleTemplate: "",
    metaDescription: "",
    googleSearchConsoleCode: "",
    sitemapEnabled: false,
  },
  localization: {
    defaultLocale: "EN",
    supportedLocales: ["EN", "FA"],
  },
  shipping: {
    flatRateFee: 0,
    freeShippingThreshold: 0,
  },
  payment: {
    enabledMethods: [],
  },
};

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getAllSettings(): Promise<SettingsData> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const K = SETTINGS_KEYS;

  return {
    general: {
      storeName: map.get(K.general.storeName) ?? DEFAULTS.general.storeName,
      supportEmail: map.get(K.general.supportEmail) ?? DEFAULTS.general.supportEmail,
      supportPhone: map.get(K.general.supportPhone) ?? DEFAULTS.general.supportPhone,
      socialLinks: parseJson(map.get(K.general.socialLinks), DEFAULTS.general.socialLinks),
    },
    seo: {
      metaTitleTemplate: map.get(K.seo.metaTitleTemplate) ?? DEFAULTS.seo.metaTitleTemplate,
      metaDescription: map.get(K.seo.metaDescription) ?? DEFAULTS.seo.metaDescription,
      googleSearchConsoleCode:
        map.get(K.seo.googleSearchConsoleCode) ?? DEFAULTS.seo.googleSearchConsoleCode,
      sitemapEnabled: map.get(K.seo.sitemapEnabled) === "true",
    },
    localization: {
      defaultLocale:
        (map.get(K.localization.defaultLocale) as SettingsData["localization"]["defaultLocale"]) ??
        DEFAULTS.localization.defaultLocale,
      supportedLocales: parseJson(
        map.get(K.localization.supportedLocales),
        DEFAULTS.localization.supportedLocales,
      ),
    },
    shipping: {
      flatRateFee: Number(map.get(K.shipping.flatRateFee) ?? DEFAULTS.shipping.flatRateFee),
      freeShippingThreshold: Number(
        map.get(K.shipping.freeShippingThreshold) ?? DEFAULTS.shipping.freeShippingThreshold,
      ),
    },
    payment: {
      enabledMethods: parseJson(map.get(K.payment.enabledMethods), DEFAULTS.payment.enabledMethods),
    },
  };
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const { general, localization } = await getAllSettings();

  return {
    storeName: general.storeName,
    supportEmail: general.supportEmail,
    supportPhone: general.supportPhone,
    socialLinks: general.socialLinks,
    defaultLocale: localization.defaultLocale,
    supportedLocales: localization.supportedLocales,
  };
}

export async function updateSettings(patch: SettingsPatchInput): Promise<SettingsData> {
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );

  return getAllSettings();
}
