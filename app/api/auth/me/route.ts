import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }
  return NextResponse.json({ success: true, data: { user } });
}
