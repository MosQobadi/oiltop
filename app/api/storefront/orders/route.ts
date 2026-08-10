import { NextResponse, type NextRequest } from "next/server";
import { storefrontOrderCreateSchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { CheckoutRejectedError, createStorefrontOrder } from "@/server/order";
import { checkCheckoutRateLimit, getClientIp } from "@/server/rateLimit";

// Checkout. Open to guests as well as signed-in customers (Design Decision 6),
// so it's rate-limited per IP before anything touches the database.
export async function POST(request: NextRequest) {
  const rateLimit = checkCheckoutRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many orders. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = storefrontOrderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Who is ordering is read from the verified session, never from the body —
  // otherwise anyone could file an order against someone else's account. A
  // signed-in ADMIN checking out is treated as a guest rather than as the
  // order's customer: the admin account is a staff login, not a shopper.
  const user = await getCurrentUser();
  const customerId = user?.role === "CUSTOMER" ? user.id : null;

  try {
    const order = await createStorefrontOrder(parsed.data, customerId);
    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error) {
    if (error instanceof CheckoutRejectedError) {
      // 409, not 400: the request was well-formed and the customer changed
      // nothing — the catalog moved while the cart sat in their browser. The
      // cart page re-reads live stock on load, so it can show which line broke.
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
