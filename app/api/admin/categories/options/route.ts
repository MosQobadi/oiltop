import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { listCategoryOptions } from "@/server/category";

export async function GET() {
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

  const categories = await listCategoryOptions();
  return NextResponse.json({ success: true, data: { categories } });
}
