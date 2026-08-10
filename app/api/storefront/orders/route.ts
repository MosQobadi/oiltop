import { NextResponse, type NextRequest } from "next/server";
import { storefrontOrderCreateSchema, storefrontOrderListQuerySchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { CheckoutRejectedError, createStorefrontOrder, listCustomerOrders } from "@/server/order";
import { checkCheckoutRateLimit, getClientIp } from "@/server/rateLimit";

// The signed-in customer's own order history. Guest orders are unreachable here
// by construction — there is no owner to check an id against, which is why the
// checkout confirmation hands its receipt over in sessionStorage instead.
export async function GET(request: NextRequest) {
  // Re-verified here rather than trusted from `proxy.ts`: the proxy guards the
  // account *pages*, not this route, and it only checks the JWT — whether that
  // user still exists and is ACTIVE is a database question. An ADMIN session is
  // not a pass either; a staff login has no order history of its own, the same
  // call checkout makes when it treats an admin as a guest.
  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const parsed = storefrontOrderListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { items, total } = await listCustomerOrders(user.id, parsed.data);
  return NextResponse.json({ success: true, data: { orders: items, total } });
}

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
