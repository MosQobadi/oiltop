import { NextResponse, type NextRequest } from "next/server";
import { storefrontOrderIdParamSchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { getCustomerOrderById, OrderAccessDeniedError, OrderNotFoundError } from "@/server/order";

type RouteContext = { params: Promise<{ id: string }> };

// One order from the signed-in customer's history. Three distinct answers, on
// purpose: 401 with no session, 404 when the id is nothing, and 403 when it is
// a real order belonging to someone else (or to no one, as a guest order does).
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = storefrontOrderIdParamSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid id" },
      { status: 400 },
    );
  }

  try {
    const order = await getCustomerOrderById(parsed.data, user.id);
    return NextResponse.json({ success: true, data: { order } });
  } catch (error) {
    if (error instanceof OrderAccessDeniedError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    throw error;
  }
}
