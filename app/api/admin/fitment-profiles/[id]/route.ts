import { NextResponse, type NextRequest } from "next/server";
import { fitmentProfileUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  FitmentProfileLinkedError,
  FitmentProfileNotFoundError,
  deleteFitmentProfile,
  getFitmentProfileById,
  updateFitmentProfile,
} from "@/server/fitmentProfile";

type RouteContext = { params: Promise<{ id: string }> };

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
    const fitmentProfile = await getFitmentProfileById(id);
    return NextResponse.json({ success: true, data: { fitmentProfile } });
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = fitmentProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const fitmentProfile = await updateFitmentProfile(id, parsed.data);
    return NextResponse.json({ success: true, data: { fitmentProfile } });
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

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    await deleteFitmentProfile(id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof FitmentProfileNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof FitmentProfileLinkedError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
}
