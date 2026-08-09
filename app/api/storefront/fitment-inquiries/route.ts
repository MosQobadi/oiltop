import { NextResponse, type NextRequest } from "next/server";
import {
  createFitmentInquiry,
  UnknownFitmentInquiryReferenceError,
} from "@/lib/services/fitment";
import { storefrontFitmentInquiryCreateSchema } from "@/lib/validation";
import { checkFitmentInquiryRateLimit, getClientIp } from "@/server/rateLimit";

// Lead capture for the car finder's no-match fallback. Public and
// unauthenticated, so it is rate-limited per IP before anything else runs —
// there is no login to slow an abuser down here.
export async function POST(request: NextRequest) {
  const rateLimit = checkFitmentInquiryRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many inquiries. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = storefrontFitmentInquiryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request",
      },
      { status: 400 },
    );
  }

  try {
    const inquiry = await createFitmentInquiry(parsed.data);
    return NextResponse.json({ success: true, data: inquiry }, { status: 201 });
  } catch (error) {
    if (error instanceof UnknownFitmentInquiryReferenceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}
