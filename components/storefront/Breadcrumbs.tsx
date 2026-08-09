import Link from "next/link";
import { pickLocale, type Locale } from "@/lib/i18n";

export interface BreadcrumbItem {
  label: string;
  /** Omitted on the last crumb — the page you're already on isn't a link. */
  href?: string;
}

export interface BreadcrumbsProps {
  locale: Locale;
  items: BreadcrumbItem[];
  className?: string;
}

// Labels arrive already localized (the caller has the data and `pickLocale`), so
// this only owns the trail's structure and its separator.
export function Breadcrumbs({ locale, items, className = "" }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  // The chevron points the way the reader is going, so it flips with the tree
  // rather than relying on the browser to mirror a glyph it won't mirror.
  const separator = locale === "fa" ? "‹" : "›";

  return (
    <nav
      aria-label={pickLocale(locale, "Breadcrumb", "مسیر صفحه")}
      data-testid="breadcrumbs"
      className={className}
    >
      <ol className="flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="focus-visible:ring-accent hover:text-accent rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "text-neutral-700" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <span aria-hidden="true">{separator}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
