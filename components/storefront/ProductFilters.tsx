"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import {
  activeProductFilterCount,
  buildProductListHref,
  clearProductFilters,
  FILTER_KIND_OPTIONS,
  filterKindLabel,
  PART_TYPE_OPTIONS,
  parseFilterKind,
  parsePartType,
  partTypeLabel,
  type ProductListParams,
} from "@/lib/storefront/plp";

// The PLP's filter rail. It holds no filter state of its own — every control
// writes the next URL and lets the server re-render the grid, which is what
// keeps a filtered view linkable and the page a Server Component. The only
// state here is whether the rail is open on a phone.
//
// Options arrive already localized: the page has the categories and brands and
// `pickLocale`, so this never needs the catalog's types (or Prisma) in the
// browser bundle.

export interface ProductFilterOption {
  value: string;
  label: string;
}

export interface ProductFiltersProps {
  locale: Locale;
  /** The PLP's own path, e.g. `/en/products`. */
  basePath: string;
  params: ProductListParams;
  categories: ProductFilterOption[];
  brands: ProductFilterOption[];
  className?: string;
}

const SELECT_CLASS =
  "focus-visible:border-accent focus-visible:ring-accent min-h-11 w-full rounded-[10px] border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 transition-colors focus-visible:ring-1 focus-visible:outline-none";

const LABEL_CLASS = "text-[12.5px] font-medium text-neutral-600";

export function ProductFilters({
  locale,
  basePath,
  params,
  categories,
  brands,
  className = "",
}: ProductFiltersProps) {
  const router = useRouter();
  const baseId = useId();
  const [open, setOpen] = useState(false);

  // Any change starts the results over: page 4 of the old filters is rarely a
  // page of the new ones.
  const apply = (next: Partial<ProductListParams>) => {
    router.push(buildProductListHref(basePath, { ...params, ...next, page: 1 }));
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("search");
    const search = typeof value === "string" ? value.trim() : "";
    apply({ search: search === "" ? undefined : search });
  };

  const handlePartTypeChange = (value: string) => {
    const partType = parsePartType(value);
    // Filter kind only means anything under FILTER (see CLAUDE.md), so moving
    // off it drops the kind rather than leaving an invisible filter applied.
    apply({ partType, filterKind: partType === "FILTER" ? params.filterKind : undefined });
  };

  // Shown under FILTER, and also whenever a kind is already applied — otherwise
  // a hand-edited URL would filter the grid with no control to undo it.
  const showFilterKind = params.partType === "FILTER" || params.filterKind !== undefined;

  const activeCount = activeProductFilterCount(params);
  const anyLabel = pickLocale(locale, "All", "همه");

  return (
    <aside data-testid="product-filters" className={className}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-controls={`${baseId}-panel`}
        className="focus-visible:ring-accent min-h-11 w-full rounded-[10px] border border-neutral-200 bg-white px-4 text-[13.5px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:hidden"
      >
        {open
          ? pickLocale(locale, "Hide filters", "بستن فیلترها")
          : pickLocale(locale, "Filters", "فیلترها")}
        {activeCount > 0 && (
          <span className="bg-accent ms-2 inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold text-white">
            {formatDigits(activeCount, locale)}
          </span>
        )}
      </button>

      <div
        id={`${baseId}-panel`}
        className={`${open ? "mt-3 block" : "hidden"} rounded-2xl border border-neutral-200 bg-white p-4 lg:mt-0 lg:block`}
      >
        <form onSubmit={handleSearch} className="flex flex-col gap-1.5">
          <label htmlFor={`${baseId}-search`} className={LABEL_CLASS}>
            {pickLocale(locale, "Search", "جست‌وجو")}
          </label>
          <div className="flex gap-2">
            {/* Uncontrolled, and re-mounted whenever the URL's search term
                changes, so "Clear all" empties the box instead of leaving a
                stale term the grid is no longer filtered by. */}
            <input
              key={params.search ?? ""}
              id={`${baseId}-search`}
              name="search"
              type="search"
              defaultValue={params.search ?? ""}
              placeholder={pickLocale(locale, "Name or part number", "نام یا شماره فنی")}
              className={`${SELECT_CLASS} min-w-0 flex-1`}
            />
            <button
              type="submit"
              className="focus-visible:ring-accent bg-accent min-h-11 shrink-0 rounded-[9px] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {pickLocale(locale, "Go", "برو")}
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-col gap-4">
          <FilterSelect
            id={`${baseId}-category`}
            label={pickLocale(locale, "Category", "دسته‌بندی")}
            anyLabel={anyLabel}
            value={params.category ?? ""}
            options={categories}
            onChange={(value) => apply({ category: value === "" ? undefined : value })}
          />

          <FilterSelect
            id={`${baseId}-brand`}
            label={pickLocale(locale, "Brand", "برند")}
            anyLabel={anyLabel}
            value={params.brand ?? ""}
            options={brands}
            onChange={(value) => apply({ brand: value === "" ? undefined : value })}
          />

          <FilterSelect
            id={`${baseId}-part-type`}
            label={pickLocale(locale, "Part type", "نوع قطعه")}
            anyLabel={anyLabel}
            value={params.partType ?? ""}
            options={PART_TYPE_OPTIONS.map((partType) => ({
              value: partType,
              label: partTypeLabel(locale, partType),
            }))}
            onChange={handlePartTypeChange}
          />

          {showFilterKind && (
            <FilterSelect
              id={`${baseId}-filter-kind`}
              label={pickLocale(locale, "Filter kind", "نوع فیلتر")}
              anyLabel={anyLabel}
              value={params.filterKind ?? ""}
              options={FILTER_KIND_OPTIONS.map((filterKind) => ({
                value: filterKind,
                label: filterKindLabel(locale, filterKind),
              }))}
              onChange={(value) => apply({ filterKind: parseFilterKind(value) })}
            />
          )}
        </div>

        {activeCount > 0 && (
          <Link
            href={buildProductListHref(basePath, clearProductFilters(params))}
            className="focus-visible:ring-accent hover:text-accent mt-4 inline-flex min-h-11 items-center rounded text-[13px] font-medium text-neutral-500 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Clear all filters", "پاک کردن همه‌ی فیلترها")}
          </Link>
        )}
      </div>
    </aside>
  );
}

function FilterSelect({
  id,
  label,
  anyLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  anyLabel: string;
  value: string;
  options: ProductFilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
