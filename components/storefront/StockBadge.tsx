import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontStockStatus } from "@/lib/services/catalog";

// Three states, and only three: the API reports OUT_OF_STOCK below 1 and
// LOW_STOCK below the inventory low-stock threshold, and returns `null` above it
// because "we have plenty" needs no badge. The exact count never leaves the
// admin panel, so this component has no number to render and never takes one.
export type StockBadgeStatus = StorefrontStockStatus | null;

export interface StockBadgeProps {
  locale: Locale;
  status: StockBadgeStatus;
  /** `inline` is the dot + label used on a product card; `pill` is the PDP's bordered chip. */
  variant?: "inline" | "pill";
  className?: string;
}

type StockStyle = { text: string; dot: string; pill: string };

const IN_STOCK = "IN_STOCK" as const;

const STOCK_STYLE: Record<typeof IN_STOCK | StorefrontStockStatus, StockStyle> = {
  IN_STOCK: {
    text: "text-emerald-700",
    dot: "bg-emerald-600",
    pill: "border-emerald-200 bg-emerald-50",
  },
  LOW_STOCK: {
    text: "text-amber-700",
    dot: "bg-amber-500",
    pill: "border-amber-200 bg-amber-50",
  },
  OUT_OF_STOCK: {
    text: "text-neutral-600",
    dot: "bg-neutral-400",
    pill: "border-neutral-200 bg-neutral-50",
  },
};

function stockLabel(status: StockBadgeStatus, locale: Locale): string {
  if (status === "OUT_OF_STOCK") return pickLocale(locale, "Out of stock", "ناموجود");
  if (status === "LOW_STOCK") return pickLocale(locale, "Low stock", "موجودی کم");
  return pickLocale(locale, "In stock", "موجود");
}

export function StockBadge({
  locale,
  status,
  variant = "inline",
  className = "",
}: StockBadgeProps) {
  const style = STOCK_STYLE[status ?? IN_STOCK];
  const label = stockLabel(status, locale);

  const shell =
    variant === "pill"
      ? `rounded-full border px-3 py-1 text-[12.5px] ${style.pill}`
      : "text-[11.5px]";

  return (
    <span
      data-testid="stock-badge"
      data-status={status ?? IN_STOCK}
      className={`inline-flex items-center gap-1.5 font-medium ${style.text} ${shell} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-full ${style.dot} ${
          variant === "pill" ? "size-1.5" : "size-[5px]"
        }`}
      />
      {label}
    </span>
  );
}
