import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/server/auth";
import { InvalidFileError, saveUploadedImage } from "@/server/upload";

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

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "No file provided" },
      { status: 400 },
    );
  }

  try {
    const url = await saveUploadedImage(file);
    return NextResponse.json({ success: true, data: { url } }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidFileError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}
