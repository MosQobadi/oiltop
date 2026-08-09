import { NextResponse, type NextRequest } from "next/server";
import { listStorefrontProducts } from "@/lib/services/catalog";
import { storefrontProductListQuerySchema } from "@/lib/validation";

// Public PLP list: filtering, search, sorting and pagination over ACTIVE
// products. Every card carries finalPrice and a stock status, never a raw
// stock count.
export async function GET(request: NextRequest) {
  const parsed = storefrontProductListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid query",
      },
      { status: 400 },
    );
  }

  const { products, total } = await listStorefrontProducts(parsed.data);
  return NextResponse.json({
    success: true,
    data: {
      products,
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
  });
}
