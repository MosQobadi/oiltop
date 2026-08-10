"use client";

import Link from "next/link";
import { Popover, useIsHydrated, useOverlayState } from "@heroui/react";
import { CartIcon } from "../icons";
import { CART_PATH, navHref, PRODUCTS_PATH } from "../nav-items";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { formatToman } from "@/lib/storefront/pricing";
import { selectCartItemCount, selectCartSubtotal, useCartStore } from "@/lib/store/cart";

// The header's cart affordance: the badge that says how much is in there, and a
// dropdown that answers "how much is that going to be" without a page load.
//
// It reads the store and nothing else. The cart page pairs the same store with
// a live catalog lookup (useCartLines), but the header renders on every route —
// re-checking stock and prices from a nav element would mean that lookup on
// every page view, to say something this panel doesn't show anyway. So both
// surfaces agree because both count the same stored lines; the reconciled truth
// lives one click away, where it's needed.
//
// Controlled state rather than trigger-driven, same as MobileNavDrawer: the
// "View cart" link has to be able to close the panel behind it, including when
// the customer is already on /cart and no navigation follows.

export function MiniCart({ locale, className = "" }: { locale: Locale; className?: string }) {
  const state = useOverlayState();

  // The cart only exists in localStorage, so the server has no count to render.
  // Showing an empty cart until hydration keeps the first client pass identical
  // to the SSR HTML instead of tripping a mismatch on every page load.
  const isHydrated = useIsHydrated();
  const storedCount = useCartStore(selectCartItemCount);
  const storedSubtotal = useCartStore(selectCartSubtotal);
  const count = isHydrated ? storedCount : 0;
  const subtotal = isHydrated ? storedSubtotal : 0;

  const label = pickLocale(locale, "Cart", "سبد خرید");

  return (
    <Popover.Root isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Popover.Trigger
        tabIndex={0}
        aria-label={count > 0 ? `${label} (${formatDigits(count, locale)})` : label}
        data-testid="mini-cart-trigger"
        className={`focus-visible:ring-accent hover:border-accent hover:text-accent inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${className}`}
      >
        <CartIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
        {count > 0 && (
          <span
            data-testid="cart-count"
            className="bg-accent inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold text-white"
          >
            {formatDigits(count, locale)}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Content placement="bottom end" className="w-[268px]">
        <Popover.Dialog className="p-4" aria-label={label}>
          <Popover.Heading className="text-[14px] font-semibold text-neutral-900">
            {label}
          </Popover.Heading>

          {count === 0 ? (
            <>
              <p className="mt-2 text-[13px] text-neutral-500">
                {pickLocale(locale, "Nothing in here yet.", "هنوز چیزی اینجا نیست.")}
              </p>
              <Link
                href={navHref(locale, PRODUCTS_PATH)}
                onClick={state.close}
                className="focus-visible:ring-accent text-accent mt-3 inline-flex min-h-11 items-center rounded text-[13px] font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {pickLocale(locale, "Browse products", "مشاهده‌ی محصولات")}
              </Link>
            </>
          ) : (
            <>
              <dl className="mt-3 flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutral-500">{pickLocale(locale, "Items", "اقلام")}</dt>
                  <dd data-testid="mini-cart-count" className="text-neutral-900 tabular-nums">
                    {formatDigits(count, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutral-500">{pickLocale(locale, "Subtotal", "جمع کل")}</dt>
                  <dd
                    data-testid="mini-cart-subtotal"
                    className="font-semibold text-neutral-900 tabular-nums"
                  >
                    {formatToman(subtotal, locale)}
                  </dd>
                </div>
              </dl>

              {/* The estimate is labelled here too, in one line: the panel
                  shows the same captured-price sum the cart page does, and
                  neither of them is the amount checkout will charge. */}
              <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
                {pickLocale(
                  locale,
                  "Estimate — delivery and the final total are confirmed at checkout.",
                  "برآورد — هزینه‌ی ارسال و مبلغ نهایی هنگام تسویه قطعی می‌شود.",
                )}
              </p>

              <Link
                href={navHref(locale, CART_PATH)}
                onClick={state.close}
                data-testid="mini-cart-view"
                className="focus-visible:ring-accent bg-accent mt-4 flex min-h-11 w-full items-center justify-center rounded-[9px] px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {pickLocale(locale, "View cart", "مشاهده‌ی سبد")}
              </Link>
            </>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  );
}
