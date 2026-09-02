"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronIcon } from "../icons";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { ProductCard } from "../ProductCard";
import { RailDots, RAIL_TRACK_CLASS, useRailScroll } from "../rail";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontProductCard } from "@/lib/services/catalog";

// The shelf directly under the hero: biggest discounts first, best-sellers
// behind them (see `listStorefrontDeals`). A horizontal rail rather than a grid
// because it's a taster, not the catalog — the PLP is one click away for anyone
// who wants all of it.
//
// Scroll-snap does the sliding, and `useRailScroll` does the bookkeeping the
// arrows and dots read — see `../rail`. This ships as a Client Component only
// for those controls and the scroll position behind them.
//
// Cards are the shared ProductCard: same markup, same add-to-cart, same
// out-of-stock behaviour as the PLP. A rail is a different layout, not a
// different product card.

const CARD_IMAGE_SIZES = "(min-width: 1024px) 240px, (min-width: 640px) 40vw, 62vw";

// How much of the visible width one arrow press travels. Just under a full
// screenful, so a card stays half-visible as a hint that the rail continues.
const SCROLL_RATIO = 0.85;

export function DealsCarousel({
  locale,
  products,
}: {
  locale: Locale;
  products: StorefrontProductCard[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const rail = useRailScroll(trackRef);

  const railLabel = pickLocale(locale, "Deals and best-sellers", "تخفیف‌ها و پرفروش‌ها");

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 pt-12 sm:px-6 lg:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <span className="text-accent bg-accent/10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tracking-[0.04em] uppercase">
            {pickLocale(locale, "On offer", "پیشنهاد ویژه")}
          </span>
          <h2 className="mt-2.5 text-[22px] font-semibold tracking-[-0.02em] text-fg">
            {railLabel}
          </h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] text-fg-subtle">
            {pickLocale(
              locale,
              "The deepest discounts on the shelf right now, alongside what everyone else is buying.",
              "بیشترین تخفیف‌های این لحظه، در کنار پرفروش‌ترین محصولات فروشگاه.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={navHref(locale, PRODUCTS_PATH)}
            className="focus-visible:ring-accent hover:text-accent me-1 inline-flex min-h-11 items-center gap-1.5 rounded text-[13.5px] text-fg-subtle transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "See all products", "مشاهده‌ی همه‌ی محصولات")}
            <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </Link>

          {/* Hidden from assistive tech: the rail itself is a scrollable list a
              screen reader walks item by item, and these only move the viewport
              over content that is already in the DOM. */}
          <div aria-hidden="true" className="hidden items-center gap-2 sm:flex">
            <RailButton
              onClick={() => rail.scrollByPage(-1, SCROLL_RATIO)}
              disabled={rail.atStart}
              className="-scale-x-100 rtl:scale-x-100"
            />
            <RailButton
              onClick={() => rail.scrollByPage(1, SCROLL_RATIO)}
              disabled={rail.atEnd}
              className="rtl:-scale-x-100"
            />
          </div>
        </div>
      </div>

      <ul
        ref={trackRef}
        onScroll={rail.onScroll}
        aria-label={railLabel}
        className={`mt-6 gap-3.5 pb-2 ${RAIL_TRACK_CLASS}`}
      >
        {products.map((product) => (
          <li
            key={product.id}
            className="w-[62vw] max-w-[240px] min-w-[168px] flex-none snap-start sm:w-[40vw] lg:w-[23%]"
          >
            <ProductCard locale={locale} product={product} imageSizes={CARD_IMAGE_SIZES} />
          </li>
        ))}
      </ul>

      <RailDots count={rail.dotCount} active={rail.activeDot} onSelect={rail.scrollToDot} />
    </section>
  );
}

function RailButton({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      className="focus-visible:ring-accent hover:border-accent/50 hover:text-accent flex size-9 items-center justify-center rounded-full border border-line bg-surface text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35"
    >
      <ChevronIcon className={`h-4 w-4 ${className}`} />
    </button>
  );
}
