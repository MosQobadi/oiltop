import { NextResponse, type NextRequest } from "next/server";
import { inventoryAddStockSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { addInventoryStock } from "@/server/inventory";
import { ProductNotFoundError } from "@/server/product";

type RouteContext = { params: Promise<{ productId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
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

  const { productId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = inventoryAddStockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const inventory = await addInventoryStock(productId, parsed.data);
    return NextResponse.json({ success: true, data: { inventory } });
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
