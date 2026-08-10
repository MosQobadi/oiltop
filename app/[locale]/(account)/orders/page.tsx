import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  OrderFulfilmentBadge,
  OrderPaymentBadge,
} from "@/components/storefront/account/OrderStatusBadge";
import { SignOutButton } from "@/components/storefront/account/SignOutButton";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import {
  ACCOUNT_ORDERS_PATH,
  ACCOUNT_PROFILE_PATH,
  loginHref,
  navHref,
  PRODUCTS_PATH,
} from "@/components/storefront/nav-items";
import { Pagination } from "@/components/storefront/Pagination";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { formatOrderNumber } from "@/lib/orders";
import { formatOrderDate } from "@/lib/storefront/orders";
import { formatToman } from "@/lib/storefront/pricing";
import { storefrontOrderListPageQuerySchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { listCustomerOrders, type CustomerOrderListItem } from "@/server/order";

// The customer's order history. Read from `server/order` directly rather than by
// fetching this app's own GET /api/storefront/orders — the same function that
// route serves, minus an HTTP round-trip to ourselves that would have to forward
// the session cookie to be allowed in. Same pattern as the PLP and the fitment
// page; the public route still exists for client callers.
//
// Guest orders never appear here, and can't: an order with no owner has nothing
// to check a session against (Design Decision 6). The receipt a guest gets is
// the checkout confirmation, handed over in sessionStorage.

const ORDERS_PAGE_SIZE = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pickLocale(locale, "Your orders", "سفارش‌های شما"),
    // One customer's private history — nothing here is for an index, and the
    // guard would turn a crawler away regardless.
    robots: { index: false, follow: false },
  };
}

// `app/[locale]/layout.tsx` sets `revalidate = 300` for the storefront tree.
// Reading the session below already makes this route dynamic, but it's spelled
// out because the failure mode if it ever weren't is serving one customer's
// orders to everyone out of the cache.
export const dynamic = "force-dynamic";

export default async function AccountOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawSearchParams] = await Promise.all([params, searchParams]);

  // `proxy.ts` already turned away anyone without a CUSTOMER token, but that
  // guard is routing convenience running on the edge with no database: it can't
  // know the account was deleted or deactivated since the token was signed.
  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") {
    redirect(loginHref(locale, navHref(locale, ACCOUNT_ORDERS_PATH)));
  }

  const { page } = storefrontOrderListPageQuerySchema.parse(rawSearchParams);
  const { items, total } = await listCustomerOrders(user.id, {
    page,
    pageSize: ORDERS_PAGE_SIZE,
  });

  const title = pickLocale(locale, "Your orders", "سفارش‌های شما");
  const basePath = navHref(locale, ACCOUNT_ORDERS_PATH);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: title },
        ]}
      />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">
            {title}
          </h1>
          <p className="mt-2 max-w-[60ch] text-[14.5px] text-neutral-500">
            {/* The name is `<bdi>` because it is user data of unknown
                direction: a Latin name inside the Persian sentence otherwise
                drags the full stop to the wrong end of the line. */}
            {pickLocale(locale, "Signed in as", "وارد شده با نام")}{" "}
            <bdi>
              {user.firstName} {user.lastName}
            </bdi>
            .
          </p>
        </div>
        {/* The account area's only other screen, reached from here rather than
            from the header — `AccountLink` stays one pill with one destination. */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={navHref(locale, ACCOUNT_PROFILE_PATH)}
            className="focus-visible:ring-accent inline-flex min-h-9 items-center rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            {pickLocale(locale, "Your details", "اطلاعات شما")}
          </Link>
          <SignOutButton locale={locale} />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white px-5 py-12 text-center">
          <p className="text-[15px] font-medium text-neutral-900">
            {pickLocale(locale, "No orders yet.", "هنوز سفارشی ثبت نکرده‌اید.")}
          </p>
          <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] text-neutral-500">
            {pickLocale(
              locale,
              "Orders you place while signed in show up here, with what you ordered and where it got to.",
              "سفارش‌هایی که با حساب خود ثبت کنید اینجا نمایش داده می‌شوند، همراه با اقلام و وضعیت آن‌ها.",
            )}
          </p>
          <Link
            href={navHref(locale, PRODUCTS_PATH)}
            className="focus-visible:ring-accent bg-accent mt-5 inline-flex min-h-11 items-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Browse products", "مشاهده‌ی محصولات")}
          </Link>
        </div>
      ) : (
        <ul data-testid="order-history" className="mt-6 flex flex-col gap-3">
          {items.map((order) => (
            <li key={order.id}>
              <OrderRow locale={locale} order={order} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        locale={locale}
        page={page}
        pageCount={Math.ceil(total / ORDERS_PAGE_SIZE)}
        hrefForPage={(target) => (target === 1 ? basePath : `${basePath}?page=${target}`)}
        className="mt-8"
      />
    </div>
  );
}

function OrderRow({ locale, order }: { locale: Locale; order: CustomerOrderListItem }) {
  return (
    <Link
      href={`${navHref(locale, ACCOUNT_ORDERS_PATH)}/${order.id}`}
      data-testid="order-row"
      className="focus-visible:ring-accent hover:border-accent block rounded-2xl border border-neutral-200 bg-white p-5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[14px] font-semibold text-neutral-900">
          {formatOrderNumber(order.id)}
        </span>
        <span className="text-[13px] text-neutral-500">
          {formatOrderDate(order.createdAt, locale)}
        </span>
      </div>

      <p className="mt-2 text-[13.5px] text-neutral-500">
        {itemCountLabel(order.itemCount, locale)} ·{" "}
        <span className="font-medium text-neutral-900 tabular-nums">
          {formatToman(order.total, locale)}
        </span>
      </p>

      {/* Both statuses, side by side and never merged into one word: this
          order can be Sending and Paid at the same time. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <OrderFulfilmentBadge locale={locale} status={order.status} />
        <OrderPaymentBadge locale={locale} status={order.paymentStatus} />
      </div>
    </Link>
  );
}

// Persian doesn't inflect the noun for number, so only the English branch has
// two forms — one reason this is a sentence built here rather than two
// `pickLocale` fragments concatenated at the call site.
function itemCountLabel(count: number, locale: Locale): string {
  const digits = formatDigits(count, locale);
  return pickLocale(locale, `${digits} ${count === 1 ? "item" : "items"}`, `${digits} قلم`);
}
