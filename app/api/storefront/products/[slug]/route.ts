import { NextResponse, type NextRequest } from "next/server";
import { getStorefrontProductBySlug } from "@/lib/services/catalog";
import { storefrontProductSlugParamSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ slug: string }> };

// Public PDP payload. A slug that doesn't exist and a slug belonging to an
// INACTIVE product (or one whose category/brand was deactivated) both return
// the same 404 — the storefront has no business distinguishing them.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const parsed = storefrontProductSlugParamSchema.safeParse((await params).slug);
  const product = parsed.success ? await getStorefrontProductBySlug(parsed.data) : null;

  if (!product) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { product } });
}
