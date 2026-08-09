import { NextResponse, type NextRequest } from "next/server";
import { resolveFitmentForEngine } from "@/lib/services/fitment";
import { AuthError, requireAdmin } from "@/server/auth";

type RouteContext = { params: Promise<{ id: string }> };

// Resolves every item across the Fitment Profile(s) attached to this car
// engine, grouped by category. The resolution itself lives in
// lib/services/fitment.ts so the public storefront car-finder routes share it
// verbatim. Treated as a plain read endpoint, not admin-CRUD, since it just
// reads existing FitmentProfile data for a given engine.
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
  const groups = await resolveFitmentForEngine(id);
  return NextResponse.json({ success: true, data: { groups } });
}
