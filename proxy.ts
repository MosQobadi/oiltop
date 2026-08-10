import { NextResponse, type NextRequest } from "next/server";
import { isProtectedAccountPath, LOGIN_PATH, navHref } from "@/components/storefront/nav-items";
import { getCookieName } from "@/lib/auth/cookies";
import { verifyToken, type UserRole } from "@/lib/auth/jwt";
import { DEFAULT_LOCALE, isLocale, localeFromSetting, type Locale } from "@/lib/i18n";

function redirectToLogin(request: NextRequest, loginPath: string): NextResponse {
  const loginUrl = new URL(loginPath, request.url);
  // Path *and* query, so signing in returns the customer to the view they were
  // actually looking at rather than the bare route.
  loginUrl.searchParams.set("from", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

// The role on the cookie's JWT, or null for no cookie / an invalid or expired
// one — all of which mean the same thing to a guard. Verification only: whether
// that user still exists and is ACTIVE is a database question, and the edge has
// no Prisma. `getCurrentUser()` re-checks both inside every route handler.
async function tokenRole(request: NextRequest): Promise<UserRole | null> {
  const token = request.cookies.get(getCookieName())?.value;
  if (!token) return null;

  try {
    return (await verifyToken(token)).role;
  } catch {
    return null;
  }
}

// Splits `/en/orders/ord_123` into "en" and the locale-relative "/orders/ord_123",
// which is the form the path constants in nav-items are written in. Null for
// anything that doesn't start with a real locale segment.
function splitLocale(pathname: string): { locale: Locale; path: string } | null {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if (!isLocale(maybeLocale)) return null;

  const path = rest.length > 0 ? `/${rest.join("/")}` : "";
  return { locale: maybeLocale, path: path.endsWith("/") ? path.slice(0, -1) : path };
}

// The proxy runs on the edge, so it can't reach Prisma directly — it asks the
// public settings route instead. Any failure (route down, DB down, malformed
// body) falls back to the default locale: the site root must never 500.
async function resolveDefaultLocale(request: NextRequest): Promise<Locale> {
  try {
    const response = await fetch(new URL("/api/storefront/settings", request.nextUrl.origin), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return DEFAULT_LOCALE;

    const body = (await response.json()) as {
      data?: { settings?: { defaultLocale?: unknown } };
    };
    return localeFromSetting(body.data?.settings?.defaultLocale);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // "/" is not a page — it hands off to the storefront's configured locale.
  // Invalid locale segments are rejected in app/[locale]/layout.tsx, which can
  // render the real 404 page instead of a bare edge response.
  if (pathname === "/") {
    const locale = await resolveDefaultLocale(request);
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // A customer's own order history, so an ADMIN session is not a pass either —
  // AccountLoginForm turns an admin away for the same reason, which is also
  // what stops that pairing from looping between form and guard.
  const account = splitLocale(pathname);
  if (account && isProtectedAccountPath(account.path)) {
    return (await tokenRole(request)) === "CUSTOMER"
      ? NextResponse.next()
      : redirectToLogin(request, navHref(account.locale, LOGIN_PATH));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (await tokenRole(request)) === "ADMIN"
      ? NextResponse.next()
      : redirectToLogin(request, "/login");
  }

  return NextResponse.next();
}

export const config = {
  // Next requires this to be statically analyzable, so the protected account
  // routes are spelled out per locale rather than built from LOCALES ×
  // PROTECTED_ACCOUNT_PATHS. The list above is what actually decides; this is
  // only the filter that keeps the proxy off every other storefront page.
  matcher: [
    "/",
    "/admin/:path*",
    "/en/orders/:path*",
    "/fa/orders/:path*",
    "/en/profile/:path*",
    "/fa/profile/:path*",
  ],
};
