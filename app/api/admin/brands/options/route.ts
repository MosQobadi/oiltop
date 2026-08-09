import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { listBrandOptions } from "@/server/brand";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const brands = await listBrandOptions();
  return NextResponse.json({ success: true, data: { brands } });
}
