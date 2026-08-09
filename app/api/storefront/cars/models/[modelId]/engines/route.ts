import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveCarModelById,
  getEnginesForModelYear,
} from "@/lib/services/fitment";
import {
  carFinderEngineQuerySchema,
  storefrontIdParamSchema,
} from "@/lib/validation";

type RouteContext = { params: Promise<{ modelId: string }> };

// Step 4 of the public car-finder wizard. A single match is still returned as a
// one-element array — whether to auto-skip the Engine step is the client's
// call, not something the API bakes into its response shape.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const parsedId = storefrontIdParamSchema.safeParse((await params).modelId);
  const carModel = parsedId.success
    ? await getActiveCarModelById(parsedId.data)
    : null;
  if (!carModel) {
    return NextResponse.json(
      { success: false, error: "Car model not found" },
      { status: 404 },
    );
  }

  const parsedQuery = carFinderEngineQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsedQuery.error.issues[0]?.message ?? "Invalid query",
      },
      { status: 400 },
    );
  }

  const carEngines = await getEnginesForModelYear(
    carModel.id,
    parsedQuery.data.year,
  );
  return NextResponse.json({ success: true, data: { carEngines } });
}
