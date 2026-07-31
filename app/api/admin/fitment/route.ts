import { NextResponse, type NextRequest } from "next/server";
import {
  fitmentRecommendationCreateSchema,
  fitmentRecommendationListQuerySchema,
} from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  createFitmentRecommendation,
  getCategoryPartType,
  listFitmentRecommendations,
} from "@/server/fitmentRecommendation";

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

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    throw error;
  }

  const parsed = fitmentRecommendationListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { fitmentRecommendations, total } = await listFitmentRecommendations(
    parsed.data,
  );
  return NextResponse.json({
    success: true,
    data: {
      fitmentRecommendations,
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const categoryId = extractCategoryId(body);
  const categoryPartType = categoryId
    ? await getCategoryPartType(categoryId)
    : undefined;

  const parsed = fitmentRecommendationCreateSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    categoryPartType,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const fitmentRecommendation = await createFitmentRecommendation(parsed.data);
  return NextResponse.json(
    { success: true, data: { fitmentRecommendation } },
    { status: 201 },
  );
}
