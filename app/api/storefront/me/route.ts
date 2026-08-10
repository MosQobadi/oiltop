import { NextResponse, type NextRequest } from "next/server";
import { storefrontProfileUpdateSchema } from "@/lib/validation";
import { DuplicateIdentifierError, getCurrentUser, updateCustomerProfile } from "@/server/auth";

// The signed-in customer editing their own account. There is deliberately no GET
// here: /api/auth/me already answers "who am I" for the browser, and the profile
// *page* is a Server Component that reads `getCustomerProfile` directly rather
// than fetching this app over HTTP — the same call the orders screen makes.
//
// PATCH by name, whole-profile by body: the form posts all four fields every
// time, so a blank email is an instruction to clear it (see
// `storefrontProfileUpdateSchema`). There is no field a partial body could
// usefully address on a four-field form.
export async function PATCH(request: NextRequest) {
  // Re-verified here rather than trusted from `proxy.ts`, which guards the
  // account pages and not this route, and which only checks the JWT — whether
  // the account still exists and is ACTIVE is a database question. An ADMIN
  // session is not a pass: a staff login has no storefront profile, the same
  // call the order history route makes.
  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = storefrontProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    // Whose profile this is comes from the verified session, never from the
    // body — the rule checkout follows for `customerId`, for the same reason.
    // `user` is what the client's auth store holds; `profile` is the row as
    // stored, phone included and normalized — see `updateCustomerProfile`.
    const { user: updated, profile } = await updateCustomerProfile(user.id, parsed.data);
    return NextResponse.json({ success: true, data: { user: updated, profile } });
  } catch (error) {
    if (error instanceof DuplicateIdentifierError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
