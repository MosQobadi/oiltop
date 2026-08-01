import { NextResponse, type NextRequest } from "next/server";
import { orderStatusUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  updateOrderStatus,
} from "@/server/order";

type RouteContext = { params: Promise<{ id: string }> };

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

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = orderStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const order = await updateOrderStatus(id, parsed.data);
    return NextResponse.json({ success: true, data: { order } });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof InvalidOrderTransitionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}
