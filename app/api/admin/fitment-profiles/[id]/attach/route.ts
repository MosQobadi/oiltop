import { NextResponse, type NextRequest } from "next/server";
import { fitmentProfileAttachSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { FitmentProfileNotFoundError, attachCarEnginesToProfile } from "@/server/fitmentProfile";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = fitmentProfileAttachSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    await attachCarEnginesToProfile(id, parsed.data);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof FitmentProfileNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    throw error;
  }
}
