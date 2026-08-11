// Storefront locale primitives. Locale is routing, not a library: `/en/...` and
// `/fa/...` are separate URL trees over one `app/[locale]/` layout, and the
// bilingual `xEn`/`xFa` column pairs are picked per-request from this value.
//
// Note the case split against `lib/validation/settings.ts`, which has its own
// `Locale` ("EN" | "FA") — that one is the *stored* Settings value, this one is
// the *URL* segment. `localeFromSetting` is the only bridge between them.

export const LOCALES = ["en", "fa"] as const;

export type Locale = (typeof LOCALES)[number];

// Persian: the shop sells in Iran, so the Persian tree is the one a customer
// who expresses no preference should land on. This is only the fallback — the
// Settings `defaultLocale` is what "/" actually redirects to (see proxy.ts);
// this answers when Settings can't be read or holds something unrecognized.
export const DEFAULT_LOCALE: Locale = "fa";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return locale === "fa" ? "rtl" : "ltr";
}

// The BCP-47 tag `Intl` needs for each tree. Lives here rather than next to any
// one formatter because prices, years and dates all need the same answer —
// `fa-IR` is what gives Persian digits everywhere numbers are rendered.
export const NUMBER_LOCALE: Record<Locale, string> = { en: "en-US", fa: "fa-IR" };

// The reader's digits with no grouping, for numbers that are labels rather than
// quantities — a model year, a step number. Grouping would turn 2006 into
// "۲٬۰۰۶" on the Persian tree, which reads as a price; `formatNumber` in
// `lib/storefront/pricing` is the one that should group.
export function formatDigits(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    useGrouping: false,
    maximumFractionDigits: 0,
  }).format(value);
}

// Settings stores the default locale uppercase ("EN" / "FA"); the URL uses
// lowercase. Anything unrecognized (missing row, hand-edited value) falls back
// to the default rather than 404-ing the site root.
export function localeFromSetting(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const normalized = value.toLowerCase();
  return isLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

// Swaps the `[locale]` segment of a pathname, keeping the rest of the path
// intact — `/en/products/x` → `/fa/products/x`, not `/fa`. Switching language
// must never lose the page the customer was on.
//
// A path with no locale segment (a client component rendered outside the
// storefront tree, same case `useLocale` guards) gets the locale prefixed
// rather than overwriting its first segment.
export function switchLocalePath(pathname: string, locale: Locale): string {
  // pathname always starts with "/", so segments[1] is the first real segment.
  const segments = pathname.split("/");
  if (isLocale(segments[1])) {
    segments[1] = locale;
    return segments.join("/");
  }
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

function isTranslated(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

// The single way to render a bilingual `xEn`/`xFa` column pair. Persian content
// will lag English for a long time, so a blank (or whitespace-only) Fa value
// falls back to En rather than rendering an empty label on the Persian tree.
//
// Two overloads so the caller's nullability carries through: a required pair
// (`nameEn`/`nameFa`) always yields a string, while an optional pair
// (`metaTitleEn`/`metaTitleFa`) yields `string | null` and has to be handled.
export function pickLocale(locale: Locale, en: string, fa: string | null | undefined): string;
export function pickLocale(
  locale: Locale,
  en: string | null | undefined,
  fa: string | null | undefined,
): string | null;
export function pickLocale(
  locale: Locale,
  en: string | null | undefined,
  fa: string | null | undefined,
): string | null {
  if (locale === "fa" && isTranslated(fa)) return fa;
  return en ?? null;
}
