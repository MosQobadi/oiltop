import { NextResponse, type NextRequest } from "next/server";
import { carModelCreateSchema, carModelListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  createCarModel,
  DuplicateSlugError,
  listCarModels,
} from "@/server/carModel";

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

  const parsed = carModelListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { carModels, total } = await listCarModels(parsed.data);
  return NextResponse.json({
    success: true,
    data: {
      carModels,
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
  const parsed = carModelCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const carModel = await createCarModel(parsed.data);
    return NextResponse.json(
      { success: true, data: { carModel } },
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
