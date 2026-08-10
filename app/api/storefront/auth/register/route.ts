import { NextResponse, type NextRequest } from "next/server";
import { setAuthCookie } from "@/lib/auth/cookies";
import { storefrontRegisterSchema } from "@/lib/validation";
import { DuplicateIdentifierError, registerCustomer } from "@/server/auth";
import { checkRegisterRateLimit, getClientIp } from "@/server/rateLimit";

// Storefront sign-up (Design Decision 7). Public and unauthenticated, so it is
// rate-limited per IP before anything else runs. There is no admin counterpart
// to this route: admin accounts are seeded, never self-served.
export async function POST(request: NextRequest) {
  const rateLimit = checkRegisterRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many sign-up attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = storefrontRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const { user, token } = await registerCustomer(parsed.data);
    // Same JWT in the same HTTP-only cookie the admin panel uses — one session
    // mechanism for the whole app, not a second storefront token.
    await setAuthCookie(token);
    return NextResponse.json({ success: true, data: { user } }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateIdentifierError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
