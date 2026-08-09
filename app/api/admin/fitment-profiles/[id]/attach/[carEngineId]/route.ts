import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { detachCarEngineFromProfile } from "@/server/fitmentProfile";

type RouteContext = { params: Promise<{ id: string; carEngineId: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id, carEngineId } = await params;
  await detachCarEngineFromProfile(id, carEngineId);
  return NextResponse.json({ success: true, data: null });
}
