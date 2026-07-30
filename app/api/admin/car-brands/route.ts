import { NextResponse, type NextRequest } from "next/server";
import { carBrandCreateSchema, carBrandListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  createCarBrand,
  DuplicateSlugError,
  listCarBrands,
} from "@/server/carBrand";

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

  const parsed = carBrandListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { carBrands, total } = await listCarBrands(parsed.data);
  return NextResponse.json({
    success: true,
    data: {
      carBrands,
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
  const parsed = carBrandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const carBrand = await createCarBrand(parsed.data);
    return NextResponse.json(
      { success: true, data: { carBrand } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
}
