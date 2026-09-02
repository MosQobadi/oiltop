import Link from "next/link";
import { ChevronIcon } from "./icons";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { paginationRange } from "@/lib/storefront/plp";

// Real links, not buttons: a paged catalog is only crawlable if page 2 has a
// URL, and the PLP renders on the server anyway. The caller owns what a page's
// href looks like (it holds the filters), this owns which pages are offered.

export interface PaginationProps {
  locale: Locale;
  page: number;
  pageCount: number;
  hrefForPage: (page: number) => string;
  className?: string;
}

const STEP_CLASS =
  "focus-visible:ring-accent inline-flex min-h-11 items-center gap-1.5 rounded-[9px] border border-line bg-surface px-3 text-[13px] font-medium text-fg-muted transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

// Disabled ends are rendered as spans, not disabled links — there is no page 0
// to point at, so there should be nothing to focus either.
const STEP_DISABLED_CLASS =
  "inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-[9px] border border-line bg-surface-sunken px-3 text-[13px] font-medium text-fg-faint";

const PAGE_CLASS =
  "focus-visible:ring-accent inline-flex min-h-11 min-w-11 items-center justify-center rounded-[9px] border border-line bg-surface px-2 text-[13px] font-medium text-fg-muted transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

const PAGE_CURRENT_CLASS =
  "bg-accent-solid inline-flex min-h-11 min-w-11 items-center justify-center rounded-[9px] px-2 text-[13px] font-semibold text-white";

export function Pagination({
  locale,
  page,
  pageCount,
  hrefForPage,
  className = "",
}: PaginationProps) {
  // One page of results needs no pager, and zero pages means the caller is
  // already showing an empty state.
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(page, 1), pageCount);
  const previousLabel = pickLocale(locale, "Previous", "قبلی");
  const nextLabel = pickLocale(locale, "Next", "بعدی");

  return (
    <nav
      aria-label={pickLocale(locale, "Pagination", "صفحه‌بندی")}
      data-testid="pagination"
      className={className}
    >
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {current > 1 ? (
            <Link href={hrefForPage(current - 1)} rel="prev" className={STEP_CLASS}>
              {/* The chevron points back the way the reader came, so it flips
                  with the tree rather than relying on the glyph to mirror. */}
              <ChevronIcon className="h-3.5 w-3.5 rotate-180 rtl:rotate-0" />
              {previousLabel}
            </Link>
          ) : (
            <span aria-hidden="true" className={STEP_DISABLED_CLASS}>
              <ChevronIcon className="h-3.5 w-3.5 rotate-180 rtl:rotate-0" />
              {previousLabel}
            </span>
          )}
        </li>

        {paginationRange(current, pageCount).map((entry, index) =>
          entry === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-[13px] text-fg-faint"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              {entry === current ? (
                <span aria-current="page" className={PAGE_CURRENT_CLASS}>
                  {formatDigits(entry, locale)}
                </span>
              ) : (
                <Link
                  href={hrefForPage(entry)}
                  aria-label={pickLocale(
                    locale,
                    `Page ${entry}`,
                    `صفحه‌ی ${formatDigits(entry, locale)}`,
                  )}
                  className={PAGE_CLASS}
                >
                  {formatDigits(entry, locale)}
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          {current < pageCount ? (
            <Link href={hrefForPage(current + 1)} rel="next" className={STEP_CLASS}>
              {nextLabel}
              <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
            </Link>
          ) : (
            <span aria-hidden="true" className={STEP_DISABLED_CLASS}>
              {nextLabel}
              <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
