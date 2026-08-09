import { NextResponse, type NextRequest } from "next/server";
import { getActiveCarBrandBySlug, getCarModelsForBrand } from "@/lib/services/fitment";
import { carBrandSlugParamSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ brandSlug: string }> };

// Step 2 of the public car-finder wizard. An INACTIVE brand is a 404 here, the
// same as one that never existed — the storefront shouldn't be able to tell
// the difference.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const parsed = carBrandSlugParamSchema.safeParse((await params).brandSlug);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Car brand not found" }, { status: 404 });
  }

  const carBrand = await getActiveCarBrandBySlug(parsed.data);
  if (!carBrand) {
    return NextResponse.json({ success: false, error: "Car brand not found" }, { status: 404 });
  }

  const carModels = await getCarModelsForBrand(carBrand.id);
  return NextResponse.json({ success: true, data: { carModels } });
}
