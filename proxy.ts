import { NextResponse, type NextRequest } from "next/server";
import { getCookieName } from "@/lib/auth/cookies";
import { verifyToken } from "@/lib/auth/jwt";

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export default async function proxy(request: NextRequest) {
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
  matcher: ["/admin/:path*"],
};
