import { NextResponse } from "next/server";
import { getPublicSettings } from "@/server/setting";

// Public store settings for the storefront shell: header/footer contact block,
// social links, and the locale set the `[locale]` router validates against
// (Phase 1). Only the allowlisted `PublicSettings` fields are returned — the
// SEO, shipping, and payment groups stay admin-only, so a future payment
// gateway key added to the Settings store can never leak through this route.
export async function GET() {
  const settings = await getPublicSettings();
  return NextResponse.json({ success: true, data: { settings } });
}
