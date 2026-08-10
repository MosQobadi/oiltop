import type { Metadata } from "next";
import { navHref } from "@/components/storefront/nav-items";
import { LOCALES, type Locale } from "@/lib/i18n";
import { absoluteUrl } from "./sitemap";

// The admin's meta fields are optional, and `BilingualTextField` sends an
// untouched one to the database as "" rather than null — so "does this page have
// a meta title" is a trim check, not a null check, everywhere a `generateMetadata`
// falls back from its SEO pair to the content's own name and description.
//
// Returns `undefined` rather than "", because that's what Next omits the tag for:
// no description beats an empty one.
export function firstFilled(...values: (string | null | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

// The page-head counterpart to `localizedEntries` in ./sitemap: the same
// cross-locale URL set, emitted as `<link rel="alternate" hreflang>` instead of
// sitemap `<xhtml:link>`. `absoluteUrl` is borrowed from there rather than
// redefined — a crawler needs the same origin in both places or the two sets
// describe different pages.
//
// `path` is locale-relative ("", "/products", "/products/mobil-1-5w30"), which
// is all a caller has to supply: Design Decision 2 gives both trees the same
// slug, so one path yields every locale's URL.
//
// The self-canonical is part of doing hreflang correctly, not an extra: a
// crawler only honours an hreflang set whose members are each canonical, and
// dropping the query string is what makes that true here — `?fit=` is car
// context riding alongside the slug (Design Decision 5), and the PLP's filter
// and page params are views of one listing, not pages of their own.
//
// No `x-default`: which tree an unmatched reader should land on is the Settings
// default locale (that's what `/` redirects to, see proxy.ts), and reading it
// would put a database query in every page's `generateMetadata` to emit a hint
// that is optional in the first place. Both locales are declared; a crawler
// picks from those.
export function localeAlternates(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: absoluteUrl(navHref(locale, path)),
    languages: Object.fromEntries(
      LOCALES.map((alternate) => [alternate, absoluteUrl(navHref(alternate, path))]),
    ),
  };
}
