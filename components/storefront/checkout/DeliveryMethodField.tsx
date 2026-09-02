"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { pickLocale, type Locale } from "@/lib/i18n";
import { DELIVERY_COST, DELIVERY_METHODS, type DeliveryMethod } from "@/lib/storefront/delivery";
import { formatToman } from "@/lib/storefront/pricing";

// The two delivery options as a radio group. Real `<input type="radio">`s under
// the cards rather than buttons holding state: arrow keys move between them, the
// group is one tab stop, and React Hook Form registers them like any other
// field — none of which is worth re-implementing for a custom look.
//
// The rates come from lib/storefront/delivery.ts, which is also what the server
// bills, so the price on the card and the price on the order can't disagree.
// The labels and ETAs live here because they're locale copy, and that file
// deliberately owns no customer-facing text.

const DELIVERY_COPY: Record<
  DeliveryMethod,
  { en: string; fa: string; etaEn: string; etaFa: string }
> = {
  nationwide: {
    en: "Nationwide courier",
    fa: "پست پیشتاز سراسری",
    etaEn: "2–4 working days",
    etaFa: "۲ تا ۴ روز کاری",
  },
  "tehran-same-day": {
    en: "Tehran same-day",
    fa: "پیک تهران، همان روز",
    etaEn: "Ordered before 13:00",
    etaFa: "سفارش تا ساعت ۱۳",
  },
};

export function DeliveryMethodField({
  locale,
  field,
}: {
  locale: Locale;
  /** The `register("deliveryMethod")` result, spread onto every radio. */
  field: UseFormRegisterReturn;
}) {
  return (
    <fieldset>
      <legend className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
        {pickLocale(locale, "Delivery method", "روش ارسال")}
      </legend>

      <div className="mt-4 flex flex-col gap-2.5">
        {DELIVERY_METHODS.map((method) => {
          const copy = DELIVERY_COPY[method];
          const label = pickLocale(locale, copy.en, copy.fa);
          const eta = pickLocale(locale, copy.etaEn, copy.etaFa);
          const cost = formatToman(DELIVERY_COST[method], locale);
          return (
            <label
              key={method}
              className="has-checked:border-accent has-focus-visible:ring-accent flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong has-checked:bg-accent-soft has-focus-visible:ring-2 has-focus-visible:ring-offset-2"
            >
              {/* Named outright rather than left to the wrapping label: the
                  three spans below are laid out as columns, and an option read
                  as "Nationwide courier, 2–4 working days, 190,000 Toman" is
                  the same sentence a sighted customer reads across the card. */}
              <input
                type="radio"
                value={method}
                aria-label={`${label} — ${eta} — ${cost}`}
                className="peer sr-only"
                data-testid={`delivery-${method}`}
                {...field}
              />
              {/* The fill is addressed as this span's child rather than with a
                  second `peer-checked:`, which only reaches siblings of the
                  input — the dot inside is a nephew, not a sibling. */}
              <span
                aria-hidden="true"
                className="peer-checked:border-accent peer-checked:[&>span]:bg-accent-solid flex size-4 flex-none items-center justify-center rounded-full border-[1.5px] border-line-strong"
              >
                <span className="size-2 rounded-full bg-transparent" />
              </span>
              <span aria-hidden="true" className="min-w-0">
                <span className="block text-[14px] font-medium text-fg">{label}</span>
                <span className="block text-[12.5px] text-fg-subtle">{eta}</span>
              </span>
              <span
                aria-hidden="true"
                className="ms-auto flex-none text-[13.5px] font-medium text-fg tabular-nums"
              >
                {cost}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
