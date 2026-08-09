import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { OrderNotFoundError, getOrderById } from "@/server/order";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id } = await params;
  try {
    const order = await getOrderById(id);
    return NextResponse.json({ success: true, data: { order } });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    throw error;
  }
}
