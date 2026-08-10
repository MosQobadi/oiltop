"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  buildProductListHref,
  parseProductSort,
  PRODUCT_SORT_OPTIONS,
  productSortLabel,
  type ProductListParams,
} from "@/lib/storefront/plp";

// Sits above the grid rather than in the filter rail, because it doesn't change
// which products are shown — only their order. Same contract as ProductFilters:
// the control writes the next URL, the server re-renders.

export interface ProductSortSelectProps {
  locale: Locale;
  basePath: string;
  params: ProductListParams;
  className?: string;
}

export function ProductSortSelect({
  locale,
  basePath,
  params,
  className = "",
}: ProductSortSelectProps) {
  const router = useRouter();
  const id = useId();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="shrink-0 text-[12.5px] font-medium text-neutral-600">
        {pickLocale(locale, "Sort", "مرتب‌سازی")}
      </label>
      <select
        id={id}
        value={params.sort ?? "newest"}
        onChange={(event) =>
          // Re-sorting starts from the top: page 3 of "newest" is a different
          // set of products than page 3 of "cheapest".
          router.push(
            buildProductListHref(basePath, {
              ...params,
              sort: parseProductSort(event.target.value),
              page: 1,
            }),
          )
        }
        className="focus-visible:border-accent focus-visible:ring-accent min-h-11 rounded-[10px] border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        {PRODUCT_SORT_OPTIONS.map((sort) => (
          <option key={sort} value={sort}>
            {productSortLabel(locale, sort)}
          </option>
        ))}
      </select>
    </div>
  );
}
