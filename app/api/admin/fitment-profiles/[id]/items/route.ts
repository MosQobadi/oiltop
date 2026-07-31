import { NextResponse, type NextRequest } from "next/server";
import { fitmentProfileItemCreateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  FitmentProfileNotFoundError,
  createFitmentProfileItem,
  getCategoryPartType,
} from "@/server/fitmentProfile";

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

export async function POST(request: NextRequest, { params }: RouteContext) {
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

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const categoryId = extractCategoryId(body);
  const categoryPartType = categoryId ? await getCategoryPartType(categoryId) : undefined;

  const parsed = fitmentProfileItemCreateSchema.safeParse({
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
    const item = await createFitmentProfileItem(id, parsed.data);
    return NextResponse.json({ success: true, data: { item } }, { status: 201 });
  } catch (error) {
    if (error instanceof FitmentProfileNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
