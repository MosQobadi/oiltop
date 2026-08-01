import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation";
import { setAuthCookie } from "@/lib/auth/cookies";
import { authenticateAdmin, AuthError } from "@/server/auth";
import { checkLoginRateLimit, getClientIp } from "@/server/rateLimit";

export async function POST(request: NextRequest) {
  const rateLimit = checkLoginRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const { user, token } = await authenticateAdmin(
      parsed.data.email,
      parsed.data.password,
    );
    await setAuthCookie(token);
    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    throw error;
  }
}
