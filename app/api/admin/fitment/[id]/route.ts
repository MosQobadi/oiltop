import { NextResponse, type NextRequest } from "next/server";
import { fitmentRecommendationUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  FitmentRecommendationNotFoundError,
  deleteFitmentRecommendation,
  getCategoryPartType,
  getFitmentRecommendationById,
  updateFitmentRecommendation,
} from "@/server/fitmentRecommendation";

type RouteContext = { params: Promise<{ id: string }> };

function extractCategoryId(body: unknown): string | undefined {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).categoryId === "string"
  ) {
    return (body as Record<string, unknown>).categoryId as string;
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

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const fitmentRecommendation = await getFitmentRecommendationById(id);
    return NextResponse.json({ success: true, data: { fitmentRecommendation } });
  } catch (error) {
    if (error instanceof FitmentRecommendationNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  let existing;
  try {
    existing = await getFitmentRecommendationById(id);
  } catch (error) {
    if (error instanceof FitmentRecommendationNotFoundError) {
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
  const categoryId = extractCategoryId(body) ?? existing.categoryId;
  const categoryPartType = await getCategoryPartType(categoryId);

  const parsed = fitmentRecommendationUpdateSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    categoryPartType,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const fitmentRecommendation = await updateFitmentRecommendation(id, parsed.data);
    return NextResponse.json({ success: true, data: { fitmentRecommendation } });
  } catch (error) {
    if (error instanceof FitmentRecommendationNotFoundError) {
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

  const { id } = await params;
  try {
    await deleteFitmentRecommendation(id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof FitmentRecommendationNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
