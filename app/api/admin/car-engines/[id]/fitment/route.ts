import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { getResolvedFitmentForCarEngine } from "@/server/fitmentProfile";

type RouteContext = { params: Promise<{ id: string }> };

// Resolves every item across the Fitment Profile(s) attached to this car
// engine — the read path the Fitment Preview tool (and eventually the
// storefront) uses. Treated as a plain read endpoint, not admin-CRUD, since
// it just flattens existing FitmentProfile data for a given engine.
export async function GET(_request: NextRequest, { params }: RouteContext) {
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
  const items = await getResolvedFitmentForCarEngine(id);
  return NextResponse.json({ success: true, data: { items } });
}
