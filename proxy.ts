import { NextResponse, type NextRequest } from "next/server";
import { getCookieName } from "@/lib/auth/cookies";
import { verifyToken } from "@/lib/auth/jwt";
import { DEFAULT_LOCALE, localeFromSetting, type Locale } from "@/lib/i18n";

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
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
  // "/" is not a page — it hands off to the storefront's configured locale.
  // Invalid locale segments are rejected in app/[locale]/layout.tsx, which can
  // render the real 404 page instead of a bare edge response.
  if (request.nextUrl.pathname === "/") {
    const locale = await resolveDefaultLocale(request);
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  const token = request.cookies.get(getCookieName())?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const { role } = await verifyToken(token);
    if (role !== "ADMIN") {
      return redirectToLogin(request);
    }
  } catch {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
