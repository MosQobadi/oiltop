import Link from "next/link";
import { pickLocale, type Locale } from "@/lib/i18n";

// "Also available in 1 L / 5 L" — the same oil in another bottle. Sizes are
// separate products in the catalog (they have their own SKU, price and stock),
// so this is a row of links to their pages rather than a control that changes
// anything on this one. No `"use client"`: it's three anchors.
//
// The current size is in the list but isn't a link, so the group reads as a
// choice with one option already taken rather than as a list of other products.

export interface SizeSelectorOption {
  label: string;
  /** Absent for the size being viewed — that chip is text, not a link. */
  href?: string;
  isCurrent: boolean;
}

export interface SizeSelectorProps {
  locale: Locale;
  options: SizeSelectorOption[];
  className?: string;
}

export function SizeSelector({ locale, options, className = "" }: SizeSelectorProps) {
  // One option is just this product; there's no choice to present.
  if (options.length < 2) return null;

  return (
    <section
      data-testid="size-selector"
      className={className}
      aria-labelledby="size-selector-label"
    >
      <p id="size-selector-label" className="text-[13px] font-medium text-neutral-500">
        {pickLocale(locale, "Size", "حجم")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <li key={option.label + (option.href ?? "")}>
            {option.isCurrent || !option.href ? (
              <span
                data-testid="size-option-current"
                aria-current="true"
                dir="auto"
                className="border-accent text-accent bg-accent/5 inline-flex min-h-11 items-center rounded-xl border px-3.5 text-[14px] font-medium"
              >
                {option.label}
              </span>
            ) : (
              <Link
                data-testid="size-option"
                href={option.href}
                dir="auto"
                className="focus-visible:ring-accent hover:border-accent hover:text-accent inline-flex min-h-11 items-center rounded-xl border border-neutral-200 px-3.5 text-[14px] text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {option.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
