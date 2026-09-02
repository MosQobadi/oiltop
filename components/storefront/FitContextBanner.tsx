import Link from "next/link";
import { FITMENT_PATH, navHref } from "./nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { formatCarLabel, withFitContext, type CarContextParts } from "@/lib/storefront/fitment";

// "Shopping for: Peugeot 206 · 1.4L TU3 Petrol (2001–2010)" — the car a
// customer resolved in the finder, carried into general browsing by `?fit=`.
//
// It is context, not a filter: the catalog underneath is the whole catalog
// (Task 4.1), so the banner's job is to say so and offer the two ways out —
// the car-specific view, and a different car. Dismissing is a link to the same
// page without `?fit=` rather than a piece of client state, because the context
// lives in the URL: hiding the banner while every link still carried the car
// would be a lie the next page tells.

export interface FitContextBannerProps {
  locale: Locale;
  car: CarContextParts & { carEngine: { id: string } };
  /** This same page without the car — where "dismiss" goes. */
  dismissHref: string;
  className?: string;
}

const LINK_CLASS =
  "focus-visible:ring-accent hover:text-accent inline-flex min-h-11 items-center rounded text-[13px] font-medium text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

export function FitContextBanner({
  locale,
  car,
  dismissHref,
  className = "",
}: FitContextBannerProps) {
  return (
    <aside
      data-testid="fit-context-banner"
      className={`flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-5 ${className}`}
    >
      <div className="min-w-0">
        <p className="font-mono text-[10.5px] tracking-[0.09em] text-fg-subtle uppercase">
          {pickLocale(locale, "Shopping for", "در حال خرید برای")}
        </p>
        <p dir="auto" className="mt-1 text-[14.5px] font-medium text-fg">
          {formatCarLabel(locale, car)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href={withFitContext(navHref(locale, FITMENT_PATH), car.carEngine.id)}
          className={`${LINK_CLASS} text-accent`}
        >
          {pickLocale(locale, "See parts that fit", "قطعات متناسب را ببینید")}
        </Link>

        <Link href={navHref(locale, FITMENT_PATH)} className={LINK_CLASS}>
          {pickLocale(locale, "Change car", "تغییر خودرو")}
        </Link>

        {/* `replace` so dismissing doesn't leave a back-button step that puts
            the banner straight back. */}
        <Link
          href={dismissHref}
          replace
          aria-label={pickLocale(locale, "Dismiss", "بستن")}
          className="focus-visible:ring-accent inline-flex size-11 items-center justify-center rounded text-[17px] leading-none text-fg-faint transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span aria-hidden="true">×</span>
        </Link>
      </div>
    </aside>
  );
}
