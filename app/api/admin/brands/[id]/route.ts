import { NextResponse, type NextRequest } from "next/server";
import { brandUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  BrandHasProductsError,
  BrandNotFoundError,
  DuplicateSlugError,
  deleteBrand,
  getBrandById,
  updateBrand,
} from "@/server/brand";

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
    const brand = await getBrandById(id);
    return NextResponse.json({ success: true, data: { brand } });
  } catch (error) {
    if (error instanceof BrandNotFoundError) {
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
  const parsed = brandUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const brand = await updateBrand(id, parsed.data);
    return NextResponse.json({ success: true, data: { brand } });
  } catch (error) {
    if (error instanceof BrandNotFoundError) {
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
    await deleteBrand(id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof BrandNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof BrandHasProductsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
