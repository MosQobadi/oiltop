import { NextResponse, type NextRequest } from "next/server";
import { carModelUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  CarModelHasEnginesError,
  CarModelNotFoundError,
  DuplicateSlugError,
  deleteCarModel,
  getCarModelById,
  updateCarModel,
} from "@/server/carModel";

type RouteContext = { params: Promise<{ id: string }> };

async function ensureAdmin() {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const carModel = await getCarModelById(id);
    return NextResponse.json({ success: true, data: { carModel } });
  } catch (error) {
    if (error instanceof CarModelNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = carModelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const carModel = await updateCarModel(id, parsed.data);
    return NextResponse.json({ success: true, data: { carModel } });
  } catch (error) {
    if (error instanceof CarModelNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    await deleteCarModel(id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof CarModelNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof CarModelHasEnginesError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
