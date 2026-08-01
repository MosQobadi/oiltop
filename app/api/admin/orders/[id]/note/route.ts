import { NextResponse, type NextRequest } from "next/server";
import { orderNoteSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { OrderNotFoundError, updateOrderNote } from "@/server/order";

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
  const parsed = orderNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const order = await updateOrderNote(id, parsed.data);
    return NextResponse.json({ success: true, data: { order } });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
