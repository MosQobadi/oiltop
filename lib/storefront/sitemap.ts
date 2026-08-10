import type { MetadataRoute } from "next";
import {
  ACCOUNT_ORDERS_PATH,
  ACCOUNT_PROFILE_PATH,
  CARS_PATH,
  CART_PATH,
  CATEGORIES_PATH,
  CHECKOUT_PATH,
  FITMENT_PATH,
  LOGIN_PATH,
  PRODUCTS_PATH,
  REGISTER_PATH,
} from "@/components/storefront/nav-items";
import { LOCALES, type Locale } from "@/lib/i18n";

// Everything `app/sitemap.ts` and `app/robots.ts` need that isn't a database
// read, kept here so it can be unit-tested without a database — the route files
// themselves stay a query plus a map.

// Absolute URLs are the one thing a sitemap can't do without: a crawler is
// handed the file out of context, so a relative path means nothing to it. The
// localhost fallback keeps `pnpm dev` and the test run working; production sets
// the real origin (see .env.example).
const DEFAULT_ORIGIN = "http://localhost:3000";

export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_ORIGIN;
  // A trailing slash would double up against the paths below, which all lead
  // with one.
  return configured.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path}`;
}

// The locale-relative paths that exist without a database row behind them. The
// account and checkout screens are deliberately absent — they're in
// PRIVATE_PATHS below instead.
export const STATIC_SITEMAP_PATHS: readonly string[] = ["", PRODUCTS_PATH, FITMENT_PATH];

// What robots.txt tells crawlers to leave alone: the transactional funnel and
// the account area, neither of which has anything to rank and both of which are
// per-visitor. /login and /register are public pages but belong to the same
// `(account)` group and are no more indexable than the rest of it.
export const PRIVATE_PATHS: readonly string[] = [
  CART_PATH,
  CHECKOUT_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  ACCOUNT_ORDERS_PATH,
  ACCOUNT_PROFILE_PATH,
];

export function productPath(locale: Locale, slug: string): string {
  return `/${locale}${PRODUCTS_PATH}/${slug}`;
}

export function categoryPath(locale: Locale, slug: string): string {
  return `/${locale}${CATEGORIES_PATH}/${slug}`;
}

export function carBrandPath(locale: Locale, brandSlug: string): string {
  return `/${locale}${CARS_PATH}/${brandSlug}`;
}

export function carModelPath(locale: Locale, brandSlug: string, modelSlug: string): string {
  return `${carBrandPath(locale, brandSlug)}/${modelSlug}`;
}

export interface SitemapEntryOptions {
  lastModified?: Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}

// One resource in, one entry per locale out. The `alternates.languages` map is
// what makes the sitemap *locale-aware* rather than merely locale-doubled: both
// URLs list each other, so a crawler treats /en/… and /fa/… as one page in two
// languages instead of two competing pages. Task 10.2 adds the matching
// <link rel="alternate"> tags in the page head.
export function localizedEntries(
  toPath: (locale: Locale) => string,
  options: SitemapEntryOptions = {},
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, absoluteUrl(toPath(locale))]),
  );

  return LOCALES.map((locale) => ({
    url: absoluteUrl(toPath(locale)),
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: { languages },
  }));
}

// robots.txt has no notion of the `[locale]` segment, so each private path is
// spelled out per locale. Listing them beats a `/*/cart` wildcard: wildcard
// support is a crawler-by-crawler courtesy, and there are only two locales.
//
// No trailing slash — a Disallow is a prefix match, so `/en/orders` covers both
// the list and `/en/orders/ord_123`, where `/en/orders/` would leave the list
// itself crawlable.
export function disallowedPaths(): string[] {
  const localized = LOCALES.flatMap((locale) => PRIVATE_PATHS.map((path) => `/${locale}${path}`));
  // The API is locale-free and serves the storefront's own fetches — nothing
  // there is a page.
  return [...localized, "/api/"];
}
