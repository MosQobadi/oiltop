// Storefront locale primitives. Locale is routing, not a library: `/en/...` and
// `/fa/...` are separate URL trees over one `app/[locale]/` layout, and the
// bilingual `xEn`/`xFa` column pairs are picked per-request from this value.
//
// Note the case split against `lib/validation/settings.ts`, which has its own
// `Locale` ("EN" | "FA") — that one is the *stored* Settings value, this one is
// the *URL* segment. `localeFromSetting` is the only bridge between them.

export const LOCALES = ["en", "fa"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return locale === "fa" ? "rtl" : "ltr";
}

// Settings stores the default locale uppercase ("EN" / "FA"); the URL uses
// lowercase. Anything unrecognized (missing row, hand-edited value) falls back
// to the default rather than 404-ing the site root.
export function localeFromSetting(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const normalized = value.toLowerCase();
  return isLocale(normalized) ? normalized : DEFAULT_LOCALE;
}
