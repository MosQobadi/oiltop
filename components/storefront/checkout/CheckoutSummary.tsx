"use client";

import Link from "next/link";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import type { CartLine } from "@/lib/storefront/cart";
import { checkoutTotals, includedVat } from "@/lib/storefront/checkout";
import type { DeliveryMethod } from "@/lib/storefront/delivery";
import { formatToman } from "@/lib/storefront/pricing";

// The sticky order summary and the button that places the order.
//
// Every figure here is the cart's own arithmetic over the prices captured when
// each item was added, plus the delivery rate the server bills. It is an
// estimate and says so: the charged price of a line is resolved server-side at
// the moment the order is created (Design Decision 8), and the confirmation
// screen is what reports the numbers that were actually billed.

export function CheckoutSummary({
  locale,
  lines,
  subtotal,
  deliveryMethod,
  disabled,
  submitting,
  note,
}: {
  locale: Locale;
  lines: CartLine[];
  subtotal: number;
  deliveryMethod: DeliveryMethod;
  disabled: boolean;
  submitting: boolean;
  /**
   * Why the button is unavailable, or an error from the last attempt. Every
   * problem it can report is fixed on the cart screen, so it carries the link
   * there rather than leaving the customer to find their own way back.
   */
  note: {
    text: string;
    tone: "neutral" | "error";
    link?: { href: string; label: string };
  } | null;
}) {
  const totals = checkoutTotals(subtotal, deliveryMethod);

  return (
    <aside className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
      <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
        {pickLocale(locale, "Order summary", "خلاصه‌ی سفارش")}
      </h2>

      <ul className="mt-4 flex flex-col gap-3 border-b border-line pb-4">
        {lines.map((line) => (
          <li key={line.item.productId} className="flex items-start gap-2.5">
            <span className="flex-none pt-px font-mono text-[11.5px] text-fg-subtle">
              {formatDigits(line.item.quantity, locale)}×
            </span>
            <span className="min-w-0 text-[13.5px] leading-snug text-fg">
              {pickLocale(locale, line.item.nameEn, line.item.nameFa)}
            </span>
            <span className="ms-auto flex-none text-[13px] font-medium text-fg tabular-nums">
              {formatToman(line.item.price * line.item.quantity, locale)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 flex flex-col gap-2.5 text-[13.5px]">
        <SummaryRow label={pickLocale(locale, "Subtotal", "جمع کالاها")}>
          {formatToman(totals.subtotal, locale)}
        </SummaryRow>
        <SummaryRow label={pickLocale(locale, "Delivery", "ارسال")}>
          {formatToman(totals.shippingCost, locale)}
        </SummaryRow>
        {/* Informational: VAT is included in the prices above, never added to
            them, so this row reads the total rather than adding to it. */}
        <SummaryRow
          label={pickLocale(locale, "VAT (9%, included)", "مالیات ارزش افزوده (۹٪، شامل شده)")}
        >
          {formatToman(includedVat(totals.total), locale)}
        </SummaryRow>
        <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
          <dt className="text-[14px] font-medium text-fg">
            {pickLocale(locale, "Total", "مبلغ نهایی")}
          </dt>
          <dd
            data-testid="checkout-total"
            className="text-[16px] font-semibold text-fg tabular-nums"
          >
            {formatToman(totals.total, locale)}
          </dd>
        </div>
      </dl>

      <button
        type="submit"
        disabled={disabled || submitting}
        data-testid="place-order"
        className="focus-visible:ring-accent bg-accent-solid mt-5 min-h-12 w-full rounded-[11px] px-4 text-[15px] font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-line disabled:text-fg-subtle"
      >
        {submitting
          ? pickLocale(locale, "Placing your order…", "در حال ثبت سفارش…")
          : pickLocale(locale, "Place order", "ثبت سفارش")}
      </button>

      {note && (
        <p
          role="status"
          data-testid="checkout-note"
          className={`mt-3 text-[12.5px] leading-relaxed ${
            note.tone === "error" ? "text-danger" : "text-fg-muted"
          }`}
        >
          {note.text}
          {note.link && (
            <>
              {" "}
              <Link
                href={note.link.href}
                className="focus-visible:ring-accent rounded font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                {note.link.label}
              </Link>
            </>
          )}
        </p>
      )}

      <p className="mt-3 text-[12.5px] leading-relaxed text-fg-subtle">
        {pickLocale(
          locale,
          "Prices are confirmed against the catalogue when you place the order. You will land on the gateway next — nothing is charged until you confirm there.",
          "قیمت‌ها هنگام ثبت سفارش با فروشگاه تطبیق داده می‌شود. سپس به درگاه بانک می‌روید؛ تا تأیید نکنید مبلغی کسر نمی‌شود.",
        )}
      </p>
    </aside>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg tabular-nums">{children}</dd>
    </div>
  );
}
