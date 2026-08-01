import { NextResponse, type NextRequest } from "next/server";
import { customerStatusSchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import { CustomerNotFoundError, updateCustomerStatus } from "@/server/customer";

type RouteContext = { params: Promise<{ id: string }> };

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
  const parsed = customerStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const customer = await updateCustomerStatus(id, parsed.data);
    return NextResponse.json({ success: true, data: { customer } });
  } catch (error) {
    if (error instanceof CustomerNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
}
