"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LOCALES, switchLocalePath, type Locale } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/useLocale";

const LABELS: Record<Locale, string> = { en: "EN", fa: "FA" };

// Real links, not buttons with router.push: the two locales are two URLs, so
// they should be crawlable, middle-clickable, and work before hydration.
function LocaleLinks({ query }: { query: string }) {
  const pathname = usePathname();
  const current = useLocale();

  return (
    <nav
      aria-label="Language"
      data-testid="locale-switcher"
      className="inline-flex items-center gap-0.5 rounded-full border border-line p-0.5"
    >
      {LOCALES.map((locale) => {
        const isActive = locale === current;
        return (
          <Link
            key={locale}
            href={`${switchLocalePath(pathname, locale)}${query}`}
            hrefLang={locale}
            aria-current={isActive ? "true" : undefined}
            data-testid={`locale-switcher-${locale}`}
            className={`focus-visible:ring-accent rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${
              isActive
                ? "bg-accent-solid text-white"
                : "text-fg-muted hover:bg-surface-muted hover:text-fg"
            }`}
          >
            {LABELS[locale]}
          </Link>
        );
      })}
    </nav>
  );
}

function LocaleLinksWithQuery() {
  const query = useSearchParams().toString();
  return <LocaleLinks query={query ? `?${query}` : ""} />;
}

export function LocaleSwitcher() {
  // `useSearchParams()` opts its subtree out of prerendering; without this
  // boundary it would drag the whole statically generated storefront page with
  // it. The fallback is the same switcher minus the query string, so nothing
  // moves when the real one hydrates.
  return (
    <Suspense fallback={<LocaleLinks query="" />}>
      <LocaleLinksWithQuery />
    </Suspense>
  );
}
