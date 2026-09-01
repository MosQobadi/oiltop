import { NextResponse, type NextRequest } from "next/server";
import { fitmentProfileUpdateSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  FitmentProfileLinkedError,
  FitmentProfileNotFoundError,
  deleteFitmentProfile,
  getFitmentProfileById,
  getFitmentProfileViscosity,
  updateFitmentProfile,
} from "@/server/fitmentProfile";

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
    const fitmentProfile = await getFitmentProfileById(id);
    return NextResponse.json({ success: true, data: { fitmentProfile } });
  } catch (error) {
    if (error instanceof FitmentProfileNotFoundError) {
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

  // The "cold grade must differ from the all-season grade" rule is cross-field,
  // and a PATCH may send only one of them. Filling in what is already stored is
  // what lets the rule see the state the profile will actually be in — the same
  // approach the item route takes for the climate rule. Only for keys the body
  // omitted, so an explicit null still clears.
  let payload = body;
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const current = await getFitmentProfileViscosity(id);
    if (current) {
      payload = {
        ...current,
        ...(body as Record<string, unknown>),
      };
    }
  }

  const parsed = fitmentProfileUpdateSchema.safeParse(payload);
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
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
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
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof FitmentProfileLinkedError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
