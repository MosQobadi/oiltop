import type { Locale } from "@/lib/i18n";

export interface StorefrontNavItem {
  key: string;
  labelEn: string;
  labelFa: string;
  // Locale-relative, so one definition serves both language trees. `navHref`
  // is the only thing that knows a URL starts with the locale segment.
  path: string;
}

// Where the car-finder wizard sends a customer once it resolves an engine, and
// the nav entry pointing at the same screen. Exported because the wizard can be
// mounted anywhere (homepage widget, a model page) and still has to know where
// results live.
export const FITMENT_PATH = "/fitment";

// The whole catalog as one filterable list — where the nav's "Categories" item
// and every "see everything" affordance points, narrowing with a query string.
export const PRODUCTS_PATH = "/products";

// One landing page per category, the crawlable counterpart to
// `/products?category=<slug>`: same grid, but a URL a search engine can rank and
// a place for the category's own copy and SEO pair to live.
export const CATEGORIES_PATH = "/categories";

export const storefrontNavItems: StorefrontNavItem[] = [
  { key: "home", labelEn: "Home", labelFa: "خانه", path: "" },
  { key: "categories", labelEn: "Categories", labelFa: "دسته‌بندی‌ها", path: PRODUCTS_PATH },
  { key: "fitment", labelEn: "Car Fitment", labelFa: "تطابق خودرو", path: FITMENT_PATH },
];

export const CART_PATH = "/cart";

// Where the cart's CTA hands off. The screen itself is Task 9.1 — the path is
// named here now so the cart has one place to point at and Phase 9 doesn't have
// to go looking for a hardcoded string.
export const CHECKOUT_PATH = "/checkout";

export function navHref(locale: Locale, path: string): string {
  return `/${locale}${path}`;
}

export function categoryHref(locale: Locale, slug: string): string {
  return navHref(locale, `${CATEGORIES_PATH}/${slug}`);
}

// A section is active for its own URL and anything nested under it, so
// /en/products/mobil-1-5w30 still highlights "Categories". Home is the
// exception: every path is nested under it, so it matches exactly.
export function isNavItemActive(pathname: string, locale: Locale, path: string): boolean {
  const href = navHref(locale, path);
  if (path === "") {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
