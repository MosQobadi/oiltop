import { NextResponse, type NextRequest } from "next/server";
import { fitmentProfileItemUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  FitmentProfileItemNotFoundError,
  deleteFitmentProfileItem,
  getCategoryPartType,
  getFitmentProfileItemById,
  updateFitmentProfileItem,
} from "@/server/fitmentProfile";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

function extractString(body: unknown, key: string): string | undefined {
  if (body && typeof body === "object") {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

async function ensureAdmin() {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id, itemId } = await params;

  let existing;
  try {
    existing = await getFitmentProfileItemById(id, itemId);
  } catch (error) {
    if (error instanceof FitmentProfileItemNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  // Re-derive the category's partType from whichever category applies after
  // this patch (a newly-supplied categoryId, or the existing one) so the
  // climate/partType rule is checked against the right category either way.
  const categoryId = extractString(body, "categoryId") ?? existing.categoryId;
  const categoryPartType = await getCategoryPartType(categoryId);

  const parsed = fitmentProfileItemUpdateSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    categoryPartType,
    // Same reasoning for climate: the schema no longer defaults it to STANDARD
    // on a patch, so the item's stored value stands in when the body omits it.
    // Without this a PATCH moving a HOT item to a FILTER category would slip
    // past checkClimate and leave a HOT filter behind.
    climate: extractString(body, "climate") ?? existing.climate,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const item = await updateFitmentProfileItem(id, itemId, parsed.data);
    return NextResponse.json({ success: true, data: { item } });
  } catch (error) {
    if (error instanceof FitmentProfileItemNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id, itemId } = await params;
  try {
    await deleteFitmentProfileItem(id, itemId);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof FitmentProfileItemNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
