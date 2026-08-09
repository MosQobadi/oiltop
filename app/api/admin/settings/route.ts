import { NextResponse, type NextRequest } from "next/server";
import { settingsPatchSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { getAllSettings, updateSettings } from "@/server/setting";

async function ensureAdmin() {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }
}

export async function GET() {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const settings = await getAllSettings();
  return NextResponse.json({ success: true, data: settings });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const settings = await updateSettings(parsed.data);
  return NextResponse.json({ success: true, data: settings });
}
