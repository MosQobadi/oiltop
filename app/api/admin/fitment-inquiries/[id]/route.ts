import { NextResponse, type NextRequest } from "next/server";
import { fitmentInquiryPatchSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  FitmentInquiryNotFoundError,
  getFitmentInquiryById,
  updateFitmentInquiry,
} from "@/server/fitmentInquiry";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
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
  try {
    const inquiry = await getFitmentInquiryById(id);
    return NextResponse.json({ success: true, data: { inquiry } });
  } catch (error) {
    if (error instanceof FitmentInquiryNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
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
  const parsed = fitmentInquiryPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const inquiry = await updateFitmentInquiry(id, parsed.data);
    return NextResponse.json({ success: true, data: { inquiry } });
  } catch (error) {
    if (error instanceof FitmentInquiryNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
