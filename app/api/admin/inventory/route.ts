import { NextResponse, type NextRequest } from "next/server";
import { inventoryListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { listInventory } from "@/server/inventory";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = inventoryListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { items, total } = await listInventory(parsed.data);
  return NextResponse.json({
    success: true,
    data: {
      items,
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
  });
}
