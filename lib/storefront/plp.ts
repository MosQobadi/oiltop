import { FIT_PARAM } from "./fitment";
import { formatNumber } from "./pricing";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  STOREFRONT_PRODUCT_SORTS,
  storefrontProductSortSchema,
  type StorefrontProductSort,
} from "@/lib/validation/storefront";

// The product listing's shared vocabulary. The PLP has no store and no state
// hook: its filters, its sort and its page all live in the query string, so the
// server can render the whole grid and a filtered view stays linkable and
// crawlable. Everything here is either "read that query string" or "write the
// next one" — the sidebar, the sort control, the pagination links and the page
// itself all go through these so none of them invents its own param name.

export const PRODUCT_SORT_OPTIONS = STOREFRONT_PRODUCT_SORTS;

/** Five rows of the four-up grid. Not a URL param — see the page-query schema. */
export const PLP_PAGE_SIZE = 20;

const DEFAULT_PRODUCT_SORT: StorefrontProductSort = "newest";

// A whole PLP URL, minus the locale prefix its caller already knows. The grid
// narrows by category, brand and search — a category is how a customer asks for
// oil filters, and there is no second spelling of that question.
export interface ProductListParams {
  category?: string;
  brand?: string;
  search?: string;
  sort?: StorefrontProductSort;
  page?: number;
  /**
   * Car context from the finder (Design Decision 5). Carried between PLP links
   * and handed on to the PDP, never used to filter the grid — narrowing to one
   * car is what the fitment results page is for.
   */
  fit?: string;
}

// Params are written in a fixed order, and anything at its default is left out
// entirely, so one set of filters is always one URL — two spellings of the same
// view would split the page's crawl budget for nothing.
export function buildProductListHref(basePath: string, params: ProductListParams): string {
  const query = new URLSearchParams();

  if (params.category) query.set("category", params.category);
  if (params.brand) query.set("brand", params.brand);
  if (params.search) query.set("search", params.search);
  if (params.sort && params.sort !== DEFAULT_PRODUCT_SORT) query.set("sort", params.sort);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.fit) query.set(FIT_PARAM, params.fit);

  const queryString = query.toString();
  return queryString === "" ? basePath : `${basePath}?${queryString}`;
}

// Sort and car context aren't filters: clearing the filters shouldn't reshuffle
// the grid or forget which car the customer is shopping for.
export function clearProductFilters(params: ProductListParams): ProductListParams {
  return { sort: params.sort, fit: params.fit };
}

export function activeProductFilterCount(params: ProductListParams): number {
  return [params.category, params.brand, params.search].filter((value) => Boolean(value)).length;
}

// `searchParams` hands every key a string, an array (repeated key) or nothing.
// Only the first value of a repeat is meaningful here, and a key present but
// empty (`?brand=`) means the customer cleared it, not that they filtered on "".
export function collapseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const collapsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.trim() !== "") collapsed[key] = first;
  }
  return collapsed;
}

// A `<select>` hands back a plain string, and "" is its "any" option — this
// turns that back into something the params type accepts rather than casting it
// and hoping.
export function parseProductSort(value: string): StorefrontProductSort {
  const parsed = storefrontProductSortSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PRODUCT_SORT;
}

// --- Labels ----------------------------------------------------------------

const PRODUCT_SORT_LABELS: Record<StorefrontProductSort, { en: string; fa: string }> = {
  newest: { en: "Newest", fa: "جدیدترین" },
  "price-asc": { en: "Price: low to high", fa: "قیمت: کم به زیاد" },
  "price-desc": { en: "Price: high to low", fa: "قیمت: زیاد به کم" },
};

export function productSortLabel(locale: Locale, sort: StorefrontProductSort): string {
  const label = PRODUCT_SORT_LABELS[sort];
  return pickLocale(locale, label.en, label.fa);
}

/** The "12 products" line above a grid — the PLP's and the category page's. */
export function productCountLabel(locale: Locale, total: number): string {
  const count = formatNumber(total, locale);
  if (locale === "fa") return `${count} محصول`;
  return total === 1 ? `${count} product` : `${count} products`;
}

// --- Pagination ------------------------------------------------------------

export function productPageCount(total: number, pageSize: number): number {
  return total === 0 ? 0 : Math.ceil(total / pageSize);
}

/**
 * The page numbers to render, with `"gap"` where a run was elided:
 * `[1, "gap", 6, 7, 8, "gap", 20]`. First and last are always present so a
 * crawler (and a customer) can reach both ends of the catalog from any page.
 */
export function paginationRange(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 0) return [];

  const current = Math.min(Math.max(page, 1), pageCount);
  const shown = new Set<number>([1, pageCount]);
  for (let candidate = current - 1; candidate <= current + 1; candidate++) {
    if (candidate >= 1 && candidate <= pageCount) shown.add(candidate);
  }

  const range: (number | "gap")[] = [];
  let previous = 0;
  for (const value of [...shown].sort((a, b) => a - b)) {
    // A gap hiding a single page is the same width as the page it hides, so a
    // run of one is rendered rather than elided.
    if (previous !== 0 && value - previous === 2) range.push(previous + 1);
    else if (previous !== 0 && value - previous > 2) range.push("gap");
    range.push(value);
    previous = value;
  }
  return range;
}
