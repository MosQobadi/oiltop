import { NextResponse, type NextRequest } from "next/server";
import { listStorefrontCartProducts } from "@/lib/services/catalog";
import { storefrontCartLookupQuerySchema } from "@/lib/validation";

// Not a server-side cart — Design Decision 4 is explicit that there isn't one.
// This is the read the browser's localStorage cart needs before it can be shown
// honestly: the customer's snapshot could be a week old, and only the catalog
// knows whether those products are still on sale, still in stock, and still at
// the price that was captured.
//
// GET with the ids in the query string (`?ids=a,b,c`) rather than a POST body:
// nothing is created here, and a cart's product ids are not personal data.
// Products that no longer resolve are absent from the response rather than
// erroring — see listStorefrontCartProducts.
export async function GET(request: NextRequest) {
  const parsed = storefrontCartLookupQuerySchema.safeParse({
    ids: request.nextUrl.searchParams.get("ids") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const products = await listStorefrontCartProducts(parsed.data.ids);
  return NextResponse.json({ success: true, data: { products } });
}
