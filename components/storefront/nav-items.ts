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

// Where the cart's CTA hands off, and where a placed order lands. The
// confirmation is a child route rather than a `?placed=` on checkout so the two
// screens are two components with two jobs — and so a reload of the receipt
// can't re-enter the form.
export const CHECKOUT_PATH = "/checkout";
export const CHECKOUT_CONFIRMATION_PATH = `${CHECKOUT_PATH}/confirmation`;

// The `app/[locale]/(account)/*` screens. The group's parentheses don't appear
// in a URL, so `/en/login` and `/en/orders` are the real paths — named here for
// the same reason as CHECKOUT_PATH, so the auth forms and Phase 7.2's route
// guard point at one definition instead of a string each.
export const LOGIN_PATH = "/login";
export const REGISTER_PATH = "/register";

// Where signing in lands. The screen itself is Task 9.1.
export const ACCOUNT_ORDERS_PATH = "/orders";

// The customer's own details — name, phone, email. The other half of the
// account area, reached from the orders screen rather than from the header:
// `AccountLink` stays one pill pointing at one destination.
export const ACCOUNT_PROFILE_PATH = "/profile";

// The account screens that require a signed-in CUSTOMER. /login and /register
// sit in the same route group and must stay public, so the guard works from
// this list rather than from the group — see `proxy.ts`, whose matcher spells
// out the locale-prefixed form of each of these and has to be kept in sync.
export const PROTECTED_ACCOUNT_PATHS: readonly string[] = [
  ACCOUNT_ORDERS_PATH,
  ACCOUNT_PROFILE_PATH,
];

export function navHref(locale: Locale, path: string): string {
  return `/${locale}${path}`;
}

// True for a locale-relative path that the guard protects, and for anything
// nested under it: /orders/ord_123 is as private as /orders.
export function isProtectedAccountPath(path: string): boolean {
  return PROTECTED_ACCOUNT_PATHS.some(
    (protectedPath) => path === protectedPath || path.startsWith(`${protectedPath}/`),
  );
}

// Where the auth forms send a customer once they're signed in: back to the page
// the guard bounced them off, or to their orders if they came on their own.
//
// `from` arrives in a query string, which anyone can write, so only a path
// inside *this* locale's storefront tree is honored — an absolute URL would be
// an open redirect, and `/en/login` would bounce them back to the form they
// just submitted. Anything else falls back rather than failing.
export function accountReturnPath(from: string | null | undefined, locale: Locale): string {
  const fallback = navHref(locale, ACCOUNT_ORDERS_PATH);
  if (!from || !from.startsWith(`${navHref(locale, "")}/`)) return fallback;

  const authPaths = [navHref(locale, LOGIN_PATH), navHref(locale, REGISTER_PATH)];
  const [pathOnly] = from.split("?");
  return authPaths.includes(pathOnly!) ? fallback : from;
}

// The inverse of `accountReturnPath`: where to send someone who has to sign in
// first, carrying the page they were trying to reach. `proxy.ts` builds the same
// URL from the live request; the account screens build it from their own path,
// because a Server Component doesn't get to read the URL it is rendering.
export function loginHref(locale: Locale, from?: string): string {
  const base = navHref(locale, LOGIN_PATH);
  return from ? `${base}?from=${encodeURIComponent(from)}` : base;
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
