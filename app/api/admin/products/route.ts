import { NextResponse, type NextRequest } from "next/server";
import { productCreateSchema, productListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { createProduct, DuplicateSkuError, listProducts } from "@/server/product";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    throw error;
  }

  const parsed = productListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { products, total } = await listProducts(parsed.data);
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

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const product = await createProduct(parsed.data);
    return NextResponse.json(
      { success: true, data: { product } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DuplicateSkuError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
}
