import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveCarModelById,
  getYearOptionsForModel,
} from "@/lib/services/fitment";
import { storefrontIdParamSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ modelId: string }> };

// Step 3 of the public car-finder wizard. Years are derived from the model's
// ACTIVE engines' ranges — there is no per-year row — so a model whose engines
// are all deactivated correctly returns an empty list rather than a 404.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const parsed = storefrontIdParamSchema.safeParse((await params).modelId);
  const carModel = parsed.success
    ? await getActiveCarModelById(parsed.data)
    : null;
  if (!carModel) {
    return NextResponse.json(
      { success: false, error: "Car model not found" },
      { status: 404 },
    );
  }

  const years = await getYearOptionsForModel(carModel.id);
  return NextResponse.json({ success: true, data: { years } });
}
