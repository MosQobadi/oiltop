import { NextResponse } from "next/server";
import { listActiveCategories } from "@/lib/services/catalog";

// Public category list for the storefront nav and the PLP filter rail — enough
// to name a category and link to it, and nothing else. The catalog is narrowed
// by category, so the fitment engine's `partType` has no business out here.
export async function GET() {
  const categories = await listActiveCategories();
  return NextResponse.json({ success: true, data: { categories } });
}
