import { NextResponse, type NextRequest } from "next/server";
import { fitmentProfileCreateSchema, fitmentProfileListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { createFitmentProfile, listFitmentProfiles } from "@/server/fitmentProfile";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = fitmentProfileListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { fitmentProfiles, total } = await listFitmentProfiles(parsed.data);
  return NextResponse.json({
    success: true,
    data: {
      fitmentProfiles,
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
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = fitmentProfileCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const fitmentProfile = await createFitmentProfile(parsed.data);
  return NextResponse.json({ success: true, data: { fitmentProfile } }, { status: 201 });
}
