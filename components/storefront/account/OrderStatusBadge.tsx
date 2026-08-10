import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/client";
import { pickLocale, type Locale } from "@/lib/i18n";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/storefront/orders";

// The two status chips an order carries. They are two components rather than
// one with a `kind` prop because they are two different vocabularies that
// happen to render alike — and because each has to say *which* status it is.
//
// A bare "Sent" next to a bare "Unpaid" is two words with no subjects. Every
// badge therefore carries its own label: visible on the detail screen, where
// there's room for a definition list, and screen-reader-only in the history
// list, where the pair sits in a row and the visual grouping does the work.

// Colour is a second channel, never the only one — the word is always there, so
// nothing here depends on distinguishing amber from green.
const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "border-neutral-200 bg-neutral-50 text-neutral-700",
  SENDING: "border-amber-200 bg-amber-50 text-amber-800",
  SENT: "border-sky-200 bg-sky-50 text-sky-800",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-800",
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  UNPAID: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REFUNDED: "border-neutral-200 bg-neutral-50 text-neutral-700",
};

interface BadgeProps {
  /** Stacks the label above the chip. Screen-reader-only when false. */
  showLabel?: boolean;
  className?: string;
}

function Badge({
  label,
  value,
  tone,
  showLabel = false,
  className = "",
}: BadgeProps & { label: string; value: string; tone: string }) {
  return (
    <span
      className={`inline-flex gap-1.5 ${showLabel ? "flex-col items-start" : "items-center"} ${className}`}
    >
      <span className={showLabel ? "text-[12.5px] text-neutral-500" : "sr-only"}>{label}</span>
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium ${tone}`}
      >
        {value}
      </span>
    </span>
  );
}

export function OrderFulfilmentBadge({
  locale,
  status,
  ...rest
}: BadgeProps & { locale: Locale; status: OrderStatus }) {
  return (
    <Badge
      label={pickLocale(locale, "Fulfilment", "وضعیت ارسال")}
      value={orderStatusLabel(status, locale)}
      tone={ORDER_STATUS_TONE[status]}
      {...rest}
    />
  );
}

export function OrderPaymentBadge({
  locale,
  status,
  ...rest
}: BadgeProps & { locale: Locale; status: PaymentStatus }) {
  return (
    <Badge
      label={pickLocale(locale, "Payment", "وضعیت پرداخت")}
      value={paymentStatusLabel(status, locale)}
      tone={PAYMENT_STATUS_TONE[status]}
      {...rest}
    />
  );
}
