"use client";

import { useRouter } from "next/navigation";
import { SelectMenu } from "./SelectMenu";
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

  return (
    <SelectMenu
      locale={locale}
      testId="sort-select"
      orientation="inline"
      className={className}
      label={pickLocale(locale, "Sort", "مرتب‌سازی")}
      value={params.sort ?? "newest"}
      options={PRODUCT_SORT_OPTIONS.map((sort) => ({
        value: sort,
        label: productSortLabel(locale, sort),
      }))}
      onChange={(value) =>
        // Re-sorting starts from the top: page 3 of "newest" is a different
        // set of products than page 3 of "cheapest".
        router.push(
          buildProductListHref(basePath, {
            ...params,
            sort: parseProductSort(value),
            page: 1,
          }),
        )
      }
    />
  );
}
