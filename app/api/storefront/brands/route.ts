import { NextResponse } from "next/server";
import { listActiveProductBrands } from "@/lib/services/catalog";

// Public product-brand list for the PLP filter. Distinct from
// /api/storefront/cars/brands, which lists CarBrands for the car finder.
export async function GET() {
  const brands = await listActiveProductBrands();
  return NextResponse.json({ success: true, data: { brands } });
}
