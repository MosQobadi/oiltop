import { NUMBER_LOCALE, type Locale } from "@/lib/i18n";

// Price formatting and discount maths for the storefront. Prices come out of
// `lib/services/catalog.ts` as two plain numbers — `price` (the list price) and
// `finalPrice` (price minus discountPercent) — and every screen that renders
// them has the same two questions: how do I write this number in the reader's
// locale, and is this product actually discounted. Both answers live here so
// PriceDisplay, ProductCard and (later) the cart can't drift apart.

// Currency is Toman everywhere; there is no multi-currency story to design for.
const CURRENCY_LABEL: Record<Locale, string> = { en: "Toman", fa: "تومان" };

// `fa-IR` gives Persian digits and the ٬ group separator for free — the same
// output the design prototype hand-rolled with a digit lookup table. Prices are
// whole Toman: `finalPrice` is a float only because it's `price * (1 - d/100)`,
// and nobody quotes fractions of a Toman.
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 0 }).format(value);
}

export function formatToman(value: number, locale: Locale): string {
  return `${formatNumber(value, locale)} ${CURRENCY_LABEL[locale]}`;
}

// The discount as a whole percent, or 0 when there isn't one. Rounding is
// deliberately the *only* test for "is this discounted": a 0.4% cut would
// otherwise strike the old price through next to a "−0%" badge.
export function getDiscountPercent(price: number, finalPrice: number): number {
  if (!(price > 0) || finalPrice >= price) return 0;
  return Math.round((1 - finalPrice / price) * 100);
}

export function isDiscounted(price: number, finalPrice: number): boolean {
  return getDiscountPercent(price, finalPrice) > 0;
}

// "−15%" / "−۱۵٪" — the corner badge on a discounted product card.
export function formatDiscountLabel(percent: number, locale: Locale): string {
  return locale === "fa" ? `−${formatNumber(percent, locale)}٪` : `−${percent}%`;
}
