"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronIcon } from "../icons";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { ProductCard } from "../ProductCard";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontProductCard } from "@/lib/services/catalog";

// The shelf directly under the hero: biggest discounts first, best-sellers
// behind them (see `listStorefrontDeals`). A horizontal rail rather than a grid
// because it's a taster, not the catalog — the PLP is one click away for anyone
// who wants all of it.
//
// Scroll-snap does the sliding; no carousel library. The arrows and the dots
// only nudge a native scroll container, so touch, trackpad, keyboard focus and
// RTL all work without being reimplemented — which is also why this ships as a
// Client Component only for those controls and the scroll position they read.
//
// Cards are the shared ProductCard: same markup, same add-to-cart, same
// out-of-stock behaviour as the PLP. A rail is a different layout, not a
// different product card.

const CARD_IMAGE_SIZES = "(min-width: 1024px) 240px, (min-width: 640px) 40vw, 66vw";

// How much of the visible width one arrow press travels. Just under a full
// screenful, so a card stays half-visible as a hint that the rail continues.
const SCROLL_RATIO = 0.85;

// Ceiling on the dots. A dot per screenful is honest on a wide screen (five of
// them), but a phone fits barely more than one card at a time — twenty deals
// would be fifteen dots, wider than the screen they sit under. Past this many,
// each dot stands for an equal slice of the rail instead of a screenful.
const MAX_DOTS = 8;

export function DealsCarousel({
  locale,
  products,
}: {
  locale: Locale;
  products: StorefrontProductCard[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [dotCount, setDotCount] = useState(1);
  const [activeDot, setActiveDot] = useState(0);

  const syncEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // RTL scroll positions run negative in every browser that matters now, so
    // the distance travelled is the absolute value either way.
    const travelled = Math.abs(track.scrollLeft);
    const max = track.scrollWidth - track.clientWidth;
    setAtStart(travelled <= 1);
    setAtEnd(travelled >= max - 1);

    // One dot per screenful, capped (see MAX_DOTS). Spacing them across the
    // scrollable range rather than in fixed page widths keeps the first and
    // last dot pinned to the two ends however the cap lands — the last
    // screenful is always a part-page, so page widths would overshoot it.
    const width = track.clientWidth;
    const dots = width > 0 ? Math.min(MAX_DOTS, Math.ceil(max / width) + 1) : 1;
    const step = dots > 1 ? max / (dots - 1) : 0;
    setDotCount(dots);
    setActiveDot(step > 0 ? Math.min(dots - 1, Math.round(travelled / step)) : 0);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    syncEdges();
    // A resize changes how much of the rail fits, and so whether an arrow still
    // has anywhere to go.
    const observer = new ResizeObserver(syncEdges);
    observer.observe(track);
    return () => observer.disconnect();
  }, [syncEdges]);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // In an RTL container "forward" is a negative scrollLeft delta.
    const sign = getComputedStyle(track).direction === "rtl" ? -1 : 1;
    track.scrollBy({ left: direction * sign * track.clientWidth * SCROLL_RATIO });
  };

  const scrollToDot = (dot: number) => {
    const track = trackRef.current;
    if (!track || dotCount < 2) return;
    const sign = getComputedStyle(track).direction === "rtl" ? -1 : 1;
    const max = track.scrollWidth - track.clientWidth;
    track.scrollTo({ left: (sign * dot * max) / (dotCount - 1) });
  };

  const railLabel = pickLocale(locale, "Deals and best-sellers", "تخفیف‌ها و پرفروش‌ها");

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 pt-12 sm:px-6 lg:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <span className="text-accent bg-accent/10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tracking-[0.04em] uppercase">
            {pickLocale(locale, "On offer", "پیشنهاد ویژه")}
          </span>
          <h2 className="mt-2.5 text-[22px] font-semibold tracking-[-0.02em] text-neutral-900">
            {railLabel}
          </h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] text-neutral-500">
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
            className="focus-visible:ring-accent hover:text-accent me-1 inline-flex min-h-11 items-center gap-1.5 rounded text-[13.5px] text-neutral-500 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "See all products", "مشاهده‌ی همه‌ی محصولات")}
            <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </Link>

          {/* Hidden from assistive tech: the rail itself is a scrollable list a
              screen reader walks item by item, and these only move the viewport
              over content that is already in the DOM. */}
          <div aria-hidden="true" className="hidden items-center gap-2 sm:flex">
            <RailButton
              onClick={() => scrollByPage(-1)}
              disabled={atStart}
              className="-scale-x-100 rtl:scale-x-100"
            />
            <RailButton
              onClick={() => scrollByPage(1)}
              disabled={atEnd}
              className="rtl:-scale-x-100"
            />
          </div>
        </div>
      </div>

      <ul
        ref={trackRef}
        onScroll={syncEdges}
        aria-label={railLabel}
        className="mt-6 flex snap-x snap-mandatory [scrollbar-width:none] gap-3.5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product) => (
          <li
            key={product.id}
            className="w-[66vw] max-w-[248px] min-w-[176px] flex-none snap-start sm:w-[40vw] lg:w-[23%]"
          >
            <ProductCard locale={locale} product={product} imageSizes={CARD_IMAGE_SIZES} />
          </li>
        ))}
      </ul>

      {/* Hidden from assistive tech for the same reason as the arrows: the rail
          is already a list a screen reader walks item by item, and these only
          move the viewport over content that is in the DOM either way. */}
      {dotCount > 1 && (
        <div aria-hidden="true" className="flex items-center justify-center gap-0.5">
          {Array.from({ length: dotCount }, (_, dot) => (
            <button
              key={dot}
              type="button"
              tabIndex={-1}
              onClick={() => scrollToDot(dot)}
              className="group flex h-7 w-6 items-center justify-center"
            >
              <span
                className={
                  dot === activeDot
                    ? "bg-accent h-1.5 w-5 rounded-full transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-neutral-300 transition-all group-hover:bg-neutral-400"
                }
              />
            </button>
          ))}
        </div>
      )}
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
      className="focus-visible:ring-accent hover:border-accent/50 hover:text-accent flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35"
    >
      <ChevronIcon className={`h-4 w-4 ${className}`} />
    </button>
  );
}
