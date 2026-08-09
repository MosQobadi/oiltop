import { NextResponse } from "next/server";
import { getActiveCarBrands } from "@/lib/services/fitment";

// Step 1 of the public car-finder wizard. No auth: every route under
// /api/storefront is anonymous and read-only, and returns ACTIVE rows only.
export async function GET() {
  const carBrands = await getActiveCarBrands();
  return NextResponse.json({ success: true, data: { carBrands } });
}
