import { NextResponse, type NextRequest } from "next/server";
import { orderListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { listOrders } from "@/server/order";

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

  const parsed = orderListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { items, total } = await listOrders(parsed.data);
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
