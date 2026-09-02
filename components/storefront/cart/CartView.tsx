"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useIsHydrated } from "@heroui/react";
import { CartLineRow } from "./CartLineRow";
import { useCartLines } from "./useCartLines";
import { ArrowIcon, CartIcon } from "../icons";
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
        <p role="status" className="mt-6 text-[14px] text-fg-subtle">
          {pickLocale(locale, "Loading your cart…", "در حال بارگذاری سبد خرید…")}
        </p>
      </>
    );
  }

  if (lines.length === 0) {
    return (
      <>
        <CartHeading>{title}</CartHeading>
        <div className="mt-6 rounded-2xl border border-line bg-surface px-5 py-14 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-muted text-fg-faint">
            <CartIcon className="size-6" />
          </span>
          <p className="text-[15px] font-medium text-fg">
            {pickLocale(locale, "Your cart is empty.", "سبد خرید شما خالی است.")}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-fg-subtle">
            {pickLocale(
              locale,
              "Find the oil and filters for your car, or browse everything we carry.",
              "روغن و فیلترهای خودرویتان را پیدا کنید، یا همه‌ی محصولات را ببینید.",
            )}
          </p>
          <Link
            href={navHref(locale, PRODUCTS_PATH)}
            className="focus-visible:ring-accent bg-accent-solid mt-5 inline-flex min-h-11 items-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_326px] lg:gap-8">
        {/* The lines get the same panel the summary has always had. On a grey
            page a bare list of hairline-separated rows reads as an unfinished
            draft next to a card, and the last row's border dangles with nothing
            under it — one white surface with dividers inside fixes both. */}
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="border-b border-line px-4 py-3.5 sm:px-5">
            <h2 className="text-[15px] font-semibold text-fg">
              {pickLocale(locale, "Products", "کالاها")}
              <span className="ms-1.5 text-[13px] font-normal text-fg-subtle tabular-nums">
                ({formatDigits(lines.length, locale)})
              </span>
            </h2>
          </header>

          <ul data-testid="cart-lines" className="divide-y divide-line/70">
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

          {/* Back to the catalogue from inside the same panel — the alternative
              is the browser's back button, and a cart is exactly where someone
              remembers the filter they also needed. */}
          <div className="border-t border-line px-4 py-3.5 sm:px-5">
            <Link
              href={navHref(locale, PRODUCTS_PATH)}
              className="focus-visible:ring-accent hover:text-accent inline-flex min-h-9 items-center gap-1.5 rounded text-[13.5px] font-medium text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <ArrowIcon className="size-4 -scale-x-100 rtl:scale-x-100" aria-hidden="true" />
              {pickLocale(locale, "Continue shopping", "ادامه‌ی خرید")}
            </Link>
          </div>
        </section>

        <aside className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
            {pickLocale(locale, "Order summary", "خلاصه‌ی سفارش")}
          </h2>

          <dl className="mt-4 flex flex-col gap-2.5 text-[13.5px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-subtle">{pickLocale(locale, "Items", "اقلام")}</dt>
              <dd className="text-fg tabular-nums">{formatDigits(itemCount, locale)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
              <dt className="text-[14px] font-medium text-fg">
                {pickLocale(locale, "Subtotal", "جمع کل")}
              </dt>
              <dd
                data-testid="cart-subtotal"
                className="text-[18px] font-semibold tracking-[-0.015em] text-fg tabular-nums"
              >
                {formatToman(subtotal, locale)}
              </dd>
            </div>
          </dl>

          {/* Said plainly rather than in a footnote: the number above is the
              prices the customer was shown, and shipping and the 9% VAT line
              are settled at checkout against the server's own recompute. */}
          <p className="mt-3 text-[12.5px] leading-relaxed text-fg-subtle">
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
              className="focus-visible:ring-accent bg-accent-solid mt-5 flex min-h-12 w-full items-center justify-center rounded-[11px] px-5 text-[15px] font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
              className="mt-5 flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-[11px] bg-line px-5 text-[15px] font-medium text-fg-subtle"
            >
              {pickLocale(locale, "Proceed to checkout", "ادامه‌ی خرید")}
            </button>
          )}

          {blockedMessage && (
            <p
              role="status"
              data-testid="cart-checkout-note"
              className={`mt-3 text-[12.5px] leading-relaxed ${
                failed ? "text-danger" : "text-fg-muted"
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
    <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-fg">{children}</h1>
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
