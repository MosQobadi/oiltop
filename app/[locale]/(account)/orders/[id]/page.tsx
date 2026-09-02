import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  OrderFulfilmentBadge,
  OrderPaymentBadge,
} from "@/components/storefront/account/OrderStatusBadge";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { ACCOUNT_ORDERS_PATH, loginHref, navHref } from "@/components/storefront/nav-items";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { formatOrderNumber } from "@/lib/orders";
import { includedVat } from "@/lib/storefront/checkout";
import { formatOrderDate, formatPostalCode } from "@/lib/storefront/orders";
import { formatToman } from "@/lib/storefront/pricing";
import { getCurrentUser } from "@/server/auth";
import { getCustomerOrderById, OrderAccessDeniedError, OrderNotFoundError } from "@/server/order";

// One past order, as its owner sees it. Everything on this page is the order's
// own snapshot — `productNameSnapshot`, `priceSnapshot`, the stored totals — and
// nothing is read back from the catalog, so a product that is renamed, repriced
// or deactivated tomorrow can't change what this order says it was. That is the
// same rule the checkout confirmation follows; the difference is only where the
// snapshot is read from (the database here, sessionStorage there).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return {
    // Derived from the id, not from a second read of the order — an id that
    // turns out to be nothing renders the 404 page and this title is dropped.
    title: `${pickLocale(locale, "Order", "سفارش")} ${formatOrderNumber(id)}`,
    robots: { index: false, follow: false },
  };
}

// Same reason as the history list: this route must never be served from the
// storefront layout's 300-second cache.
export const dynamic = "force-dynamic";

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;

  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") {
    redirect(loginHref(locale, `${navHref(locale, ACCOUNT_ORDERS_PATH)}/${id}`));
  }

  // The API answers 403 for an order that exists but isn't theirs; a *page* has
  // no reason to confirm that much. Both cases render the same 404, so browsing
  // ids tells an attacker nothing about which ones are real.
  let order;
  try {
    order = await getCustomerOrderById(id, user.id);
  } catch (error) {
    if (error instanceof OrderNotFoundError || error instanceof OrderAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  const ordersHref = navHref(locale, ACCOUNT_ORDERS_PATH);
  const orderNumber = formatOrderNumber(order.id);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: pickLocale(locale, "Your orders", "سفارش‌های شما"), href: ordersHref },
          { label: orderNumber },
        ]}
      />

      <h1 className="mt-5 font-mono text-[27px] font-semibold tracking-[-0.02em] text-fg">
        {orderNumber}
      </h1>
      <p className="mt-2 text-[14px] text-fg-subtle">
        {pickLocale(locale, "Placed on", "ثبت‌شده در")} {formatOrderDate(order.createdAt, locale)}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="flex flex-col gap-4">
          {/* Two statuses, shown independently and labelled: an order can be on
              its way and still unpaid, and blending them into a single "state"
              would lose the half the customer is actually asking about. */}
          <section
            data-testid="order-statuses"
            className="flex flex-wrap gap-x-8 gap-y-4 rounded-2xl border border-line bg-surface p-5"
          >
            <OrderFulfilmentBadge locale={locale} status={order.status} showLabel />
            <OrderPaymentBadge locale={locale} status={order.paymentStatus} showLabel />
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
              {pickLocale(locale, "What you ordered", "اقلام سفارش")}
            </h2>
            <ul className="mt-4 flex flex-col">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  data-testid="order-line"
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-line py-3.5 first:pt-0 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    {/* The snapshot name, in the language the order stored it in
                        — inventing a translation now would be showing live data
                        with extra steps. */}
                    <p className="text-[14px] font-medium text-fg">{item.productName}</p>
                    <p className="mt-0.5 text-[12.5px] text-fg-subtle tabular-nums">
                      {formatDigits(item.quantity, locale)} × {formatToman(item.price, locale)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-semibold text-fg tabular-nums">
                    {formatToman(item.lineTotal, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
              {pickLocale(locale, "Shipping to", "ارسال به")}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">
              {order.shippingAddress}
            </p>
            <p className="mt-1 text-[13px] text-fg-subtle tabular-nums">
              {pickLocale(locale, "Postal code", "کد پستی")}{" "}
              {formatPostalCode(order.postalCode, locale)}
            </p>
          </section>
        </div>

        <aside className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
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
            {/* Read *out of* the total rather than added to it — VAT is included
                in every price charged, which is why the stored `tax` is 0. */}
            <TotalRow
              label={pickLocale(locale, "VAT (9%, included)", "مالیات ارزش افزوده (۹٪، شامل شده)")}
            >
              {formatToman(includedVat(order.total), locale)}
            </TotalRow>
            <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
              <dt className="text-[14px] font-medium text-fg">
                {pickLocale(locale, "Total", "مبلغ نهایی")}
              </dt>
              <dd
                data-testid="order-total"
                className="text-[16px] font-semibold text-fg tabular-nums"
              >
                {formatToman(order.total, locale)}
              </dd>
            </div>
          </dl>

          <Link
            href={ordersHref}
            className="focus-visible:ring-accent mt-5 flex min-h-11 w-full items-center justify-center rounded-[9px] border border-line-strong px-5 text-[14px] font-medium text-fg-muted transition-colors hover:border-fg-faint focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Back to your orders", "بازگشت به سفارش‌ها")}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function TotalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg tabular-nums">{children}</dd>
    </div>
  );
}
