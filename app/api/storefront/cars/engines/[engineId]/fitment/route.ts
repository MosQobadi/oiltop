import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveCarEngineContext,
  resolveFitmentForEngine,
} from "@/lib/services/fitment";
import { storefrontIdParamSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ engineId: string }> };

// The payoff of the car-finder wizard: what this engine needs, grouped by
// category. Same resolution the admin Fitment Preview runs (lib/services/
// fitment.ts), so the two surfaces can't drift. Items with a null product are
// spec-only — the car's requirement is known, the catalog just doesn't carry a
// match yet — and the storefront turns those into a Fitment Inquiry.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const parsed = storefrontIdParamSchema.safeParse((await params).engineId);
  const context = parsed.success
    ? await getActiveCarEngineContext(parsed.data)
    : null;
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Car engine not found" },
      { status: 404 },
    );
  }

  const groups = await resolveFitmentForEngine(context.carEngine.id);
  return NextResponse.json({
    success: true,
    data: {
      carBrand: context.carBrand,
      carModel: context.carModel,
      carEngine: context.carEngine,
      groups,
    },
  });
}
