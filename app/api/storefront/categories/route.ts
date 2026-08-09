import { NextResponse } from "next/server";
import { listActiveCategories } from "@/lib/services/catalog";

// Public category list for the storefront nav and the PLP filter rail.
// partType/filterKind ride along because the PLP filters on them — they are
// the fitment engine's identifiers, never the display names (see CLAUDE.md).
export async function GET() {
  const categories = await listActiveCategories();
  return NextResponse.json({ success: true, data: { categories } });
}
