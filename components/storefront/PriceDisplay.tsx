import { pickLocale, type Locale } from "@/lib/i18n";
import { formatToman, isDiscounted } from "@/lib/storefront/pricing";

export interface PriceDisplayProps {
  locale: Locale;
  /** List price, before any discount. */
  price: number;
  /** What the customer actually pays — `price * (1 - discountPercent / 100)`. */
  finalPrice: number;
  /** `sm` in a cart line, `md` on a product card, `lg` on the PDP's buy box. */
  size?: "sm" | "md" | "lg";
  /**
   * `inverse` is for a price sitting on a photograph rather than on the page —
   * the product card lays it over the image. Only the two colours change; the
   * discount rule, the sizes and the screen-reader label are the same, because
   * this component is the one place that decides what "discounted" means.
   */
  tone?: "default" | "inverse";
  className?: string;
}

const FINAL_PRICE_CLASS: Record<NonNullable<PriceDisplayProps["size"]>, string> = {
  sm: "text-[15px] font-semibold tracking-tight",
  md: "text-[17px] font-semibold tracking-tight",
  lg: "text-3xl font-semibold tracking-tight",
};

const ORIGINAL_PRICE_CLASS: Record<NonNullable<PriceDisplayProps["size"]>, string> = {
  sm: "text-[12.5px]",
  md: "text-[13px]",
  lg: "text-[17px]",
};

const FINAL_PRICE_TONE: Record<NonNullable<PriceDisplayProps["tone"]>, string> = {
  default: "text-neutral-900",
  inverse: "text-white",
};

const ORIGINAL_PRICE_TONE: Record<NonNullable<PriceDisplayProps["tone"]>, string> = {
  default: "text-neutral-500",
  // Lighter than the 60%-ish grey its counterpart uses: over a photograph the
  // struck-through price still has to clear AA against the scrim beneath it.
  inverse: "text-white/70",
};

// The one place that decides whether a product reads as discounted. Callers pass
// both numbers straight from the API and never compare them for themselves —
// otherwise a card, a cart line and a PDP can each land on a different answer
// for the same product (see `getDiscountPercent`'s rounding rule).
export function PriceDisplay({
  locale,
  price,
  finalPrice,
  size = "sm",
  tone = "default",
  className = "",
}: PriceDisplayProps) {
  const discounted = isDiscounted(price, finalPrice);

  return (
    <p className={`flex flex-wrap items-baseline gap-2 ${className}`}>
      <span className={`${FINAL_PRICE_TONE[tone]} ${FINAL_PRICE_CLASS[size]}`}>
        {formatToman(finalPrice, locale)}
      </span>
      {discounted && (
        // `<s>` isn't announced by most screen readers, so the label carries the
        // meaning that the strikethrough carries visually.
        <s className={`${ORIGINAL_PRICE_TONE[tone]} ${ORIGINAL_PRICE_CLASS[size]}`}>
          <span className="sr-only">{pickLocale(locale, "Was", "قیمت پیشین")} </span>
          {formatToman(price, locale)}
        </s>
      )}
    </p>
  );
}
