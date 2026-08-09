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

export const storefrontNavItems: StorefrontNavItem[] = [
  { key: "home", labelEn: "Home", labelFa: "خانه", path: "" },
  // The catalog is one filterable list rather than a separate category index,
  // so "Categories" lands on the product list and filters from there.
  { key: "categories", labelEn: "Categories", labelFa: "دسته‌بندی‌ها", path: "/products" },
  { key: "fitment", labelEn: "Car Fitment", labelFa: "تطابق خودرو", path: FITMENT_PATH },
];

export const CART_PATH = "/cart";

export function navHref(locale: Locale, path: string): string {
  return `/${locale}${path}`;
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
