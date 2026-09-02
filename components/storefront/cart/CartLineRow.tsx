"use client";

import Image from "next/image";
import Link from "next/link";
import { TrashIcon } from "../icons";
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
// The row reads in two columns and four corners: the picture, then the name
// with its remove control opposite, and underneath, the stepper with the line
// total opposite it. Quantity and the money that quantity produces sit on the
// same baseline, which is the one relationship a cart has to make obvious —
// the earlier layout put the total up beside the name, three rows away from
// the control that changes it.
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

// Product photography is shot on white (see CLAUDE.md), so the thumbnail gets a
// white panel with a hairline edge rather than the tinted well it used to sit
// in — on grey, a contained white-background shot reads as a pasted-in
// rectangle instead of a product. Same reasoning as ProductCard's panel.
const IMAGE_CLASS =
  "relative size-[84px] shrink-0 overflow-hidden rounded-xl border border-line/80 bg-surface sm:size-[104px]";

const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-200) 0 1px, transparent 1px 9px), linear-gradient(160deg, #fff 0%, var(--color-neutral-50) 100%)",
};

export function CartLineRow({ locale, line, onQuantityChange, onRemove }: CartLineRowProps) {
  const { item, live, maxQuantity, unavailable, outOfStock, exceedsStock, priceChanged } = line;

  const name = pickLocale(locale, item.nameEn, item.nameFa);
  const productHref = navHref(locale, `${PRODUCTS_PATH}/${item.slug}`);
  // The stepper is pointless on a line that can't be ordered at any quantity —
  // removing it is the only move left, so that's the only control offered.
  const quantityLocked = unavailable || outOfStock;
  const showLivePrice = live !== null && !priceChanged;
  const lineTotal = item.price * item.quantity;

  return (
    // A line that stops checkout gets a wash the others don't. The note under
    // it says what is wrong, but the summary only says "one of these" — the
    // tint is what turns that into a row the eye lands on in a long cart.
    <li
      data-testid="cart-line"
      data-product-id={item.productId}
      className={`flex gap-4 p-4 transition-colors sm:gap-5 sm:p-5 ${
        quantityLocked ? "bg-danger-soft/50" : ""
      }`}
    >
      <Link
        href={productHref}
        aria-hidden="true"
        tabIndex={-1}
        className={`${IMAGE_CLASS} ${unavailable || outOfStock ? "opacity-55" : ""}`}
      >
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(min-width: 640px) 104px, 84px"
            className="object-contain p-2"
          />
        ) : (
          <span
            style={PLACEHOLDER_STYLE}
            className="flex h-full w-full items-center justify-center font-mono text-[9.5px] tracking-[0.04em] text-fg-faint"
          >
            {pickLocale(locale, "no image", "بدون تصویر")}
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={productHref}
            className="focus-visible:ring-accent hover:text-accent line-clamp-2 rounded text-[14.5px] leading-snug font-medium text-fg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {name}
          </Link>

          {/* An icon in the row's corner rather than an underlined word down in
              the controls: removing is the one destructive thing here, and it
              was competing with the stepper for the same line of attention. */}
          <button
            type="button"
            onClick={onRemove}
            data-testid="cart-line-remove"
            title={pickLocale(locale, "Remove", "حذف")}
            aria-label={`${pickLocale(locale, "Remove", "حذف")} — ${name}`}
            className="focus-visible:ring-accent -me-1.5 -mt-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] text-fg-faint transition-colors hover:bg-surface-muted hover:text-danger focus-visible:ring-2 focus-visible:outline-none"
          >
            <TrashIcon className="size-[17px]" />
          </button>
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
          className="mt-1.5"
        />

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

        {/* Pushed to the bottom of the row so the stepper and the total line up
            with the picture's lower edge however long the name runs. */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-1">
          {!quantityLocked && (
            <QuantityStepper
              locale={locale}
              value={item.quantity}
              onChange={onQuantityChange}
              max={maxQuantity}
              itemLabel={name}
            />
          )}

          {/* What this line adds to the subtotal, so the summary's number is
              never one the customer has to reconstruct — every row carries one,
              down a single column, or the total stops being checkable by eye.
              The multiplication above it appears from two upwards; at one the
              figure is the unit price and there is nothing to spell out. */}
          <div className="ms-auto text-end">
            {item.quantity > 1 && (
              <span className="block text-[12px] text-fg-subtle tabular-nums">
                {formatDigits(item.quantity, locale)} × {formatToman(item.price, locale)}
              </span>
            )}
            <span className="block text-[15px] font-semibold text-fg tabular-nums">
              {formatToman(lineTotal, locale)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

const NOTE_TONE_CLASS = {
  blocking: "text-danger",
  warning: "text-warning",
  info: "text-fg-subtle",
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
