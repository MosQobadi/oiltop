"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useIsHydrated } from "@heroui/react";
import { CartLineRow } from "./CartLineRow";
import { useCartLines } from "./useCartLines";
import { CHECKOUT_PATH, navHref, PRODUCTS_PATH } from "../nav-items";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { cartBlockingReason, type CartBlockingReason } from "@/lib/storefront/cart";
import { formatToman } from "@/lib/storefront/pricing";

// The cart screen. Everything it renders comes from useCartLines (Task 6.1):
// the store holds what the customer added, the hook re-reads what the catalog
// says about it now, and this composes the two.
//
// The cart lives in localStorage, so the server has nothing to render and the
// first client pass has to match that. Until hydration this is a placeholder,
// not an empty cart — telling a customer with four items that their cart is
// empty, even for one frame, is the one wrong thing this screen could say.

export function CartView({ locale }: { locale: Locale }) {
  const isHydrated = useIsHydrated();
  const {
    lines,
    subtotal,
    itemCount,
    loading,
    failed,
    canCheckout,
    setQuantity,
    removeItem,
    retry,
  } = useCartLines();

  const title = pickLocale(locale, "Your cart", "سبد خرید شما");

  if (!isHydrated) {
    return (
      <>
        <CartHeading>{title}</CartHeading>
        <p role="status" className="mt-6 text-[14px] text-neutral-500">
          {pickLocale(locale, "Loading your cart…", "در حال بارگذاری سبد خرید…")}
        </p>
      </>
    );
  }

  if (lines.length === 0) {
    return (
      <>
        <CartHeading>{title}</CartHeading>
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white px-5 py-12 text-center">
          <p className="text-[15px] font-medium text-neutral-900">
            {pickLocale(locale, "Your cart is empty.", "سبد خرید شما خالی است.")}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-neutral-500">
            {pickLocale(
              locale,
              "Find the oil and filters for your car, or browse everything we carry.",
              "روغن و فیلترهای خودرویتان را پیدا کنید، یا همه‌ی محصولات را ببینید.",
            )}
          </p>
          <Link
            href={navHref(locale, PRODUCTS_PATH)}
            className="focus-visible:ring-accent bg-accent mt-5 inline-flex min-h-11 items-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Browse products", "مشاهده‌ی محصولات")}
          </Link>
        </div>
      </>
    );
  }

  const blockedMessage = checkoutBlockedMessage({
    locale,
    loading,
    failed,
    reason: cartBlockingReason(lines),
  });

  return (
    <>
      <CartHeading>{title}</CartHeading>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_326px] lg:gap-10">
        <ul data-testid="cart-lines" className="flex flex-col">
          {lines.map((line) => (
            <CartLineRow
              key={line.item.productId}
              locale={locale}
              line={line}
              onQuantityChange={(quantity) => setQuantity(line.item.productId, quantity)}
              onRemove={() => removeItem(line.item.productId)}
            />
          ))}
        </ul>

        <aside className="rounded-2xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[15px] font-semibold text-neutral-900">
            {pickLocale(locale, "Order summary", "خلاصه‌ی سفارش")}
          </h2>

          <dl className="mt-4 flex flex-col gap-2 text-[13.5px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-500">{pickLocale(locale, "Items", "اقلام")}</dt>
              <dd className="text-neutral-900 tabular-nums">{formatDigits(itemCount, locale)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-neutral-200 pt-3">
              <dt className="font-medium text-neutral-900">
                {pickLocale(locale, "Subtotal", "جمع کل")}
              </dt>
              <dd
                data-testid="cart-subtotal"
                className="text-[16px] font-semibold text-neutral-900 tabular-nums"
              >
                {formatToman(subtotal, locale)}
              </dd>
            </div>
          </dl>

          {/* Said plainly rather than in a footnote: the number above is the
              prices the customer was shown, and shipping and the 9% VAT line
              are settled at checkout against the server's own recompute. */}
          <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-500">
            {pickLocale(
              locale,
              "An estimate from the prices shown when you added each item. Delivery and the final total are confirmed at checkout.",
              "برآوردی بر پایه‌ی قیمت‌های زمان افزودن هر کالا. هزینه‌ی ارسال و مبلغ نهایی هنگام تسویه قطعی می‌شود.",
            )}
          </p>

          {canCheckout ? (
            <Link
              href={navHref(locale, CHECKOUT_PATH)}
              data-testid="cart-checkout"
              className="focus-visible:ring-accent bg-accent mt-5 flex min-h-11 w-full items-center justify-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {pickLocale(locale, "Proceed to checkout", "ادامه‌ی خرید")}
            </Link>
          ) : (
            // Disabled rather than hidden, and always with the reason next to
            // it: a CTA that vanishes leaves the customer guessing what the
            // cart wants from them.
            <button
              type="button"
              disabled
              data-testid="cart-checkout"
              className="mt-5 flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-[9px] bg-neutral-200 px-5 text-[14px] font-medium text-neutral-500"
            >
              {pickLocale(locale, "Proceed to checkout", "ادامه‌ی خرید")}
            </button>
          )}

          {blockedMessage && (
            <p
              role="status"
              data-testid="cart-checkout-note"
              className={`mt-3 text-[12.5px] leading-relaxed ${
                failed ? "text-red-600" : "text-neutral-600"
              }`}
            >
              {blockedMessage}{" "}
              {failed && (
                <button
                  type="button"
                  onClick={retry}
                  className="focus-visible:ring-accent rounded font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  {pickLocale(locale, "Try again", "تلاش دوباره")}
                </button>
              )}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function CartHeading({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">{children}</h1>
  );
}

// One sentence under the CTA saying why it isn't a link yet. The order matches
// how much the customer can do about it: a failed or unfinished lookup is ours
// to fix, and only after it has answered is a line's own problem worth naming.
function checkoutBlockedMessage({
  locale,
  loading,
  failed,
  reason,
}: {
  locale: Locale;
  loading: boolean;
  failed: boolean;
  reason: CartBlockingReason | null;
}): string | null {
  if (failed) {
    return pickLocale(
      locale,
      "We couldn't check availability just now, so checkout is on hold.",
      "بررسی موجودی در این لحظه ممکن نشد، بنابراین تسویه فعلاً متوقف است.",
    );
  }

  if (loading) {
    return pickLocale(locale, "Checking availability…", "در حال بررسی موجودی…");
  }

  if (reason === "unavailable") {
    return pickLocale(
      locale,
      "One of these products is no longer available. Remove it to continue.",
      "یکی از این محصولات دیگر موجود نیست. برای ادامه آن را حذف کنید.",
    );
  }

  if (reason === "outOfStock") {
    return pickLocale(
      locale,
      "An item in your cart is out of stock. Remove it to continue.",
      "یکی از اقلام سبد خرید ناموجود است. برای ادامه آن را حذف کنید.",
    );
  }

  if (reason === "exceedsStock") {
    return pickLocale(
      locale,
      "An item is above what's left in stock. Lower its quantity to continue.",
      "تعداد یکی از اقلام از موجودی باقی‌مانده بیشتر است. برای ادامه آن را کم کنید.",
    );
  }

  return null;
}
