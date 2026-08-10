"use client";

import Link from "next/link";
import { useIsHydrated } from "@heroui/react";
import { CART_PATH, navHref, PRODUCTS_PATH } from "../nav-items";
import { formatDigits, NUMBER_LOCALE, pickLocale, type Locale } from "@/lib/i18n";
import { formatOrderNumber } from "@/lib/orders";
import { includedVat } from "@/lib/storefront/checkout";
import { formatToman } from "@/lib/storefront/pricing";
import { useOrderConfirmationStore } from "@/lib/store/order-confirmation";

// The receipt for the order that was just placed.
//
// Every figure and every product name here comes from the API's response and
// nothing else — not from the cart it was built from, and not from the catalog.
// That's the point of the snapshot: a price that moves an hour later, or a
// product that gets renamed, must not change what a placed order says it was.
// It's also why the names are English on both trees — `productNameSnapshot` is
// what the order stored, and inventing a Persian name for it now would be
// showing live data with extra steps.

export function OrderConfirmation({ locale }: { locale: Locale }) {
  const isHydrated = useIsHydrated();
  const order = useOrderConfirmationStore((state) => state.order);

  // The order lives in sessionStorage, so the server renders nothing and the
  // first client pass has to match — same reason as the cart screen.
  if (!isHydrated) {
    return (
      <p role="status" className="text-[14px] text-neutral-500">
        {pickLocale(locale, "Loading…", "در حال بارگذاری…")}
      </p>
    );
  }

  if (!order) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-12 text-center">
        <p className="text-[15px] font-medium text-neutral-900">
          {pickLocale(locale, "There's no order to show here.", "سفارشی برای نمایش وجود ندارد.")}
        </p>
        <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] text-neutral-500">
          {pickLocale(
            locale,
            "A confirmation is only shown right after an order is placed. If you've just ordered, the order is safe — we have it.",
            "صفحه‌ی تأیید فقط بلافاصله پس از ثبت سفارش نمایش داده می‌شود. اگر همین حالا سفارش داده‌اید، سفارش شما ثبت شده است.",
          )}
        </p>
        <Link
          href={navHref(locale, PRODUCTS_PATH)}
          className="focus-visible:ring-accent bg-accent mt-5 inline-flex min-h-11 items-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {pickLocale(locale, "Browse products", "مشاهده‌ی محصولات")}
        </Link>
      </div>
    );
  }

  const repriced = order.items.filter((item) => item.repriced);

  return (
    <div data-testid="order-confirmation">
      <p className="text-accent font-mono text-[10.5px] tracking-[0.08em] uppercase">
        {pickLocale(locale, "Order placed", "سفارش ثبت شد")}
      </p>
      <h1 className="mt-2 text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">
        {pickLocale(locale, "Thank you — we have your order.", "سپاسگزاریم — سفارش شما ثبت شد.")}
      </h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-neutral-500">
        {pickLocale(
          locale,
          "Keep the order number below — it's how we find your order if you call.",
          "شماره‌ی سفارش زیر را نگه دارید — اگر تماس بگیرید، سفارش شما با همین شماره پیدا می‌شود.",
        )}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label={pickLocale(locale, "Order number", "شماره‌ی سفارش")}>
                <span data-testid="order-number" className="font-mono">
                  {formatOrderNumber(order.id)}
                </span>
              </Detail>
              <Detail label={pickLocale(locale, "Placed on", "تاریخ ثبت")}>
                {formatOrderDate(order.createdAt, locale)}
              </Detail>
              {/* Two statuses, never blended: an order can be on its way and
                  still unpaid, and each answers a different question. */}
              <Detail label={pickLocale(locale, "Fulfilment status", "وضعیت ارسال")}>
                {pickLocale(locale, "Pending", "در انتظار")}
              </Detail>
              <Detail label={pickLocale(locale, "Payment status", "وضعیت پرداخت")}>
                {pickLocale(locale, "Unpaid", "پرداخت‌نشده")}
              </Detail>
            </dl>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-neutral-900">
              {pickLocale(locale, "What you ordered", "اقلام سفارش")}
            </h2>
            <ul className="mt-4 flex flex-col">
              {order.items.map((item) => (
                <li
                  key={item.productId}
                  data-testid="confirmation-line"
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-neutral-200 py-3.5 first:pt-0 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-neutral-900">{item.productName}</p>
                    <p className="mt-0.5 text-[12.5px] text-neutral-500 tabular-nums">
                      {formatDigits(item.quantity, locale)} × {formatToman(item.unitPrice, locale)}
                    </p>
                    {/* Design Decision 8's visible edge: the 24-hour hold ran
                        out, or the shelf price dropped below it. Either way the
                        customer is told what they were charged and what the
                        cart had quoted. */}
                    {item.repriced && item.previousUnitPrice !== null && (
                      <p className="mt-1 text-[12.5px] text-amber-700">
                        {pickLocale(
                          locale,
                          `Priced at checkout — your cart showed ${formatToman(item.previousUnitPrice, locale)}.`,
                          `قیمت هنگام تسویه به‌روز شد — در سبد خرید ${formatToman(item.previousUnitPrice, locale)} بود.`,
                        )}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-[14px] font-semibold text-neutral-900 tabular-nums">
                    {formatToman(item.lineTotal, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-neutral-900">
              {pickLocale(locale, "Shipping to", "ارسال به")}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-700">
              {order.shippingAddress}
            </p>
            <p className="mt-1 text-[13px] text-neutral-500 tabular-nums">
              {pickLocale(locale, "Postal code", "کد پستی")}{" "}
              {formatPostalCode(order.postalCode, locale)}
            </p>
          </section>
        </div>

        <aside className="rounded-2xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-neutral-900">
            {pickLocale(locale, "Order total", "مبلغ سفارش")}
          </h2>

          <dl className="mt-4 flex flex-col gap-2.5 text-[13.5px]">
            <TotalRow label={pickLocale(locale, "Subtotal", "جمع کالاها")}>
              {formatToman(order.subtotal, locale)}
            </TotalRow>
            {order.discount > 0 && (
              <TotalRow label={pickLocale(locale, "Discount", "تخفیف")}>
                −{formatToman(order.discount, locale)}
              </TotalRow>
            )}
            <TotalRow label={pickLocale(locale, "Delivery", "ارسال")}>
              {formatToman(order.shippingCost, locale)}
            </TotalRow>
            <TotalRow
              label={pickLocale(locale, "VAT (9%, included)", "مالیات ارزش افزوده (۹٪، شامل شده)")}
            >
              {formatToman(includedVat(order.total), locale)}
            </TotalRow>
            <div className="flex items-center justify-between gap-4 border-t border-neutral-200 pt-3">
              <dt className="text-[14px] font-medium text-neutral-900">
                {pickLocale(locale, "Total", "مبلغ نهایی")}
              </dt>
              <dd
                data-testid="confirmation-total"
                className="text-[16px] font-semibold text-neutral-900 tabular-nums"
              >
                {formatToman(order.total, locale)}
              </dd>
            </div>
          </dl>

          {repriced.length > 0 && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-amber-700">
              {pickLocale(
                locale,
                "Some prices were confirmed against the catalogue when you ordered, so this total may differ from your cart's estimate.",
                "قیمت برخی اقلام هنگام ثبت سفارش با فروشگاه تطبیق داده شد، بنابراین این مبلغ ممکن است با برآورد سبد خرید متفاوت باشد.",
              )}
            </p>
          )}

          <Link
            href={navHref(locale, PRODUCTS_PATH)}
            className="focus-visible:ring-accent bg-accent mt-5 flex min-h-11 w-full items-center justify-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Continue shopping", "ادامه‌ی خرید")}
          </Link>
          <Link
            href={navHref(locale, CART_PATH)}
            className="focus-visible:ring-accent mt-2 flex min-h-11 w-full items-center justify-center rounded-[9px] border border-neutral-300 px-5 text-[14px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Back to cart", "بازگشت به سبد خرید")}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] text-neutral-500">{label}</dt>
      <dd className="mt-1 text-[14px] font-medium text-neutral-900">{children}</dd>
    </div>
  );
}

function TotalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900 tabular-nums">{children}</dd>
    </div>
  );
}

// A postal code is ten digits that happen to be written with digits — not a
// number. Localizing it one character at a time is what keeps a leading zero,
// which `Number(...)` would drop and `formatNumber` would group into a price.
function formatPostalCode(postalCode: string, locale: Locale): string {
  return postalCode.replace(/\d/g, (digit) => formatDigits(Number(digit), locale));
}

// `fa-IR` gives the Persian calendar and Persian digits; `en-US` the Gregorian
// date. Local to this screen — the account's order history (Task 9.1) will want
// the same thing, and sharing it before there are two callers would be guessing
// at what the second one needs.
function formatOrderDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
