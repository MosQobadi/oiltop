"use client";

import Image from "next/image";
import Link from "next/link";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { PriceDisplay } from "../PriceDisplay";
import { QuantityStepper } from "../QuantityStepper";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import type { CartLine } from "@/lib/storefront/cart";
import { formatToman } from "@/lib/storefront/pricing";

// One line of the cart. Everything it knows arrives as a prop — the store
// writes live in CartView, so this stays a presentational component that a
// warning state can be reasoned about without a browser.
//
// The two prices a line can hold are deliberately not blended: the amount that
// adds up to the subtotal is the one captured on add (what the customer was
// shown), and a catalog price that has since moved is reported as a notice
// rather than quietly swapped in — per Design Decision 8 only checkout gets to
// settle which one is charged.

export interface CartLineRowProps {
  locale: Locale;
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-200) 0 1px, transparent 1px 9px)",
};

export function CartLineRow({ locale, line, onQuantityChange, onRemove }: CartLineRowProps) {
  const { item, live, maxQuantity, unavailable, outOfStock, exceedsStock, priceChanged } = line;

  const name = pickLocale(locale, item.nameEn, item.nameFa);
  const productHref = navHref(locale, `${PRODUCTS_PATH}/${item.slug}`);
  // The stepper is pointless on a line that can't be ordered at any quantity —
  // removing it is the only move left, so that's the only control offered.
  const quantityLocked = unavailable || outOfStock;
  const showLivePrice = live !== null && !priceChanged;

  return (
    <li
      data-testid="cart-line"
      data-product-id={item.productId}
      className="flex gap-4 border-b border-neutral-200 py-5 first:pt-0"
    >
      <Link
        href={productHref}
        aria-hidden="true"
        tabIndex={-1}
        className="relative size-[88px] shrink-0 overflow-hidden rounded-xl bg-neutral-100"
      >
        {item.image ? (
          <Image src={item.image} alt="" fill sizes="88px" className="object-contain p-1.5" />
        ) : (
          <span
            style={PLACEHOLDER_STYLE}
            className="flex h-full w-full items-center justify-center font-mono text-[9.5px] tracking-[0.04em] text-neutral-500"
          >
            {pickLocale(locale, "no image", "بدون تصویر")}
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <Link
            href={productHref}
            className="focus-visible:ring-accent hover:text-accent rounded text-[14.5px] font-medium text-neutral-900 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {name}
          </Link>

          {/* What this line adds to the subtotal, so the summary's number is
              never one the customer has to reconstruct. */}
          <span className="shrink-0 text-[14.5px] font-semibold text-neutral-900 tabular-nums">
            {formatToman(item.price * item.quantity, locale)}
          </span>
        </div>

        {/* The unit price shown is always the one the line total and the
            subtotal are built from — the captured one. The catalog's pair is
            used only while the two agree, which is what lets a discounted
            product keep its struck-through list price here; once they diverge
            the new figure moves into the notice below, where it can be
            explained, rather than sitting above a total it doesn't multiply
            out to. */}
        <PriceDisplay
          locale={locale}
          price={showLivePrice ? live.price : item.price}
          finalPrice={showLivePrice ? live.finalPrice : item.price}
          className="mt-1"
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {!quantityLocked && (
            <QuantityStepper
              locale={locale}
              value={item.quantity}
              onChange={onQuantityChange}
              max={maxQuantity}
              itemLabel={name}
            />
          )}

          <button
            type="button"
            onClick={onRemove}
            data-testid="cart-line-remove"
            aria-label={`${pickLocale(locale, "Remove", "حذف")} — ${name}`}
            className="focus-visible:ring-accent min-h-11 rounded text-[13px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Remove", "حذف")}
          </button>
        </div>

        {/* Every note here appears only once the lookup has answered, so the
            region is polite rather than assertive — nothing has gone wrong at
            the moment the customer is reading it. */}
        <div role="status" className="empty:hidden">
          {unavailable && (
            <LineNote tone="blocking">
              {pickLocale(
                locale,
                "No longer available. Remove it to continue.",
                "دیگر موجود نیست. برای ادامه آن را حذف کنید.",
              )}
            </LineNote>
          )}

          {outOfStock && (
            <LineNote tone="blocking">
              {pickLocale(
                locale,
                "Out of stock. Remove it to continue, and we'll have it back soon.",
                "ناموجود است. برای ادامه آن را حذف کنید؛ به‌زودی دوباره موجود می‌شود.",
              )}
            </LineNote>
          )}

          {exceedsStock && (
            <LineNote tone="warning">
              {pickLocale(
                locale,
                `Only ${formatDigits(maxQuantity, locale)} left. Lower the quantity to continue.`,
                `تنها ${formatDigits(maxQuantity, locale)} عدد باقی مانده است. برای ادامه تعداد را کم کنید.`,
              )}
            </LineNote>
          )}

          {priceChanged && live && (
            <LineNote tone="info">
              {pickLocale(
                locale,
                `Now ${formatToman(live.finalPrice, locale)} in the catalogue. Your price may update at checkout.`,
                `اکنون در فروشگاه ${formatToman(live.finalPrice, locale)} است. ممکن است قیمت شما هنگام تسویه به‌روز شود.`,
              )}
            </LineNote>
          )}
        </div>
      </div>
    </li>
  );
}

const NOTE_TONE_CLASS = {
  blocking: "text-red-600",
  warning: "text-amber-700",
  info: "text-neutral-500",
} as const;

function LineNote({
  tone,
  children,
}: {
  tone: keyof typeof NOTE_TONE_CLASS;
  children: React.ReactNode;
}) {
  return (
    <p className={`mt-2 text-[12.5px] leading-relaxed ${NOTE_TONE_CLASS[tone]}`}>{children}</p>
  );
}
