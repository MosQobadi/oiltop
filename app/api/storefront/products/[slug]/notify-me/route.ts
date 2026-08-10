import { NextResponse, type NextRequest } from "next/server";
import {
  createStockNotification,
  deriveStorefrontStockStatus,
  getActiveProductByIdOrSlug,
} from "@/lib/services/catalog";
import { stockNotificationCreateSchema } from "@/lib/validation";
import { checkStockNotificationRateLimit, getClientIp } from "@/server/rateLimit";

// The task list spells this route as /products/:id/notify-me, but Next.js
// requires one name per dynamic segment and the sibling PDP route owns
// [slug] — so the segment is resolved as an id *or* a slug and both work.
type RouteContext = { params: Promise<{ slug: string }> };

// Back-in-stock signup (Design Decision 9). Only meaningful while the product
// is out of stock; a request against an in-stock product is accepted and
// recorded rather than rejected, because stock can drop again between the PDP
// render and the submit, and a 4xx here would be a confusing dead end for a
// customer who did nothing wrong. The response says which happened so the PDP
// can adjust its confirmation copy.
export async function POST(request: NextRequest, { params }: RouteContext) {
  // Public and unauthenticated like the fitment inquiry route, and it writes a
  // row too — so it is limited per IP before anything touches the database.
  const rateLimit = checkStockNotificationRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const { slug } = await params;

  const body = await request.json().catch(() => null);
  const parsed = stockNotificationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request",
      },
      { status: 400 },
    );
  }

  const product = await getActiveProductByIdOrSlug(slug);
  if (!product) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
  }

  const stockStatus = deriveStorefrontStockStatus(product.inventory?.stock ?? 0);
  const notification = await createStockNotification(product.id, parsed.data.contact);

  return NextResponse.json(
    {
      success: true,
      data: {
        notification,
        alreadyInStock: stockStatus !== "OUT_OF_STOCK",
      },
    },
    { status: 201 },
  );
}
