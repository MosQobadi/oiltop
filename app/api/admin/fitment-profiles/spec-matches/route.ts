import { NextResponse, type NextRequest } from "next/server";
import { fitmentSpecMatchQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { previewFitmentSpecMatches } from "@/server/fitmentProfile";

// Sits beside [id] rather than under it because a spec match is a question
// about the catalog, not about one profile — the item modal calls it while the
// item is still being typed. Static segment, so it never shadows a profile id.
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = fitmentSpecMatchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { total, products } = await previewFitmentSpecMatches(parsed.data);
  return NextResponse.json({ success: true, data: { total, products } });
}
