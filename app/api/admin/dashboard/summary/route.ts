import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { getDashboardSummary } from "@/server/dashboard";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const summary = await getDashboardSummary();
  return NextResponse.json({ success: true, data: summary });
}
