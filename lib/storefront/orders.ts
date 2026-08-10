import type { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/client";
import { formatDigits, NUMBER_LOCALE, pickLocale, type Locale } from "@/lib/i18n";

// How an order reads to the customer who placed it: what its two statuses are
// called, and how the two values that are digits-but-not-numbers are written.
// Shared by the checkout confirmation and the account's order history, which
// show the same order at two moments and must not describe it differently.
//
// Pure, and free of Prisma at runtime — the enum types are `import type`, so
// nothing from `lib/generated` reaches the browser bundle.

// **Two statuses, never blended.** An order can be on its way and still unpaid,
// and each answers a different question: `status` is where the parcel is,
// `paymentStatus` is whether the money has arrived. The design brief is explicit
// that both are shown independently, so there is deliberately no combined
// "order state" here for a screen to reach for instead.
const ORDER_STATUS_LABELS: Record<OrderStatus, { en: string; fa: string }> = {
  PENDING: { en: "Pending", fa: "در انتظار" },
  SENDING: { en: "Sending", fa: "در حال ارسال" },
  SENT: { en: "Sent", fa: "ارسال شد" },
  DELIVERED: { en: "Delivered", fa: "تحویل شد" },
  CANCELLED: { en: "Cancelled", fa: "لغو شد" },
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { en: string; fa: string }> = {
  UNPAID: { en: "Unpaid", fa: "پرداخت‌نشده" },
  PAID: { en: "Paid", fa: "پرداخت‌شده" },
  REFUNDED: { en: "Refunded", fa: "بازگشت وجه" },
};

// The English half matches the admin panel's wording exactly. A customer
// reading "Sending" to someone on the phone has to land on the same word the
// staff member is looking at, or the call goes nowhere.
export function orderStatusLabel(status: OrderStatus, locale: Locale): string {
  const label = ORDER_STATUS_LABELS[status];
  return pickLocale(locale, label.en, label.fa);
}

export function paymentStatusLabel(status: PaymentStatus, locale: Locale): string {
  const label = PAYMENT_STATUS_LABELS[status];
  return pickLocale(locale, label.en, label.fa);
}

// `fa-IR` gives the Persian calendar and Persian digits; `en-US` the Gregorian
// date. The time is kept because two orders on the same day are otherwise
// indistinguishable in a history list.
export function formatOrderDate(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// A postal code is ten digits that happen to be written with digits — not a
// number. Localizing it one character at a time is what keeps a leading zero,
// which `Number(...)` would drop and `formatNumber` would group into a price.
export function formatPostalCode(postalCode: string, locale: Locale): string {
  return postalCode.replace(/\d/g, (digit) => formatDigits(Number(digit), locale));
}
