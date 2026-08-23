import { NextResponse, type NextRequest } from "next/server";
import { carEngineCreateSchema, carEngineListQuerySchema } from "@/lib/validation";
import { AuthError, requireAdmin } from "@/server/auth";
import {
  CarEngineNotFoundError,
  CarEngineYearCalendarError,
  createCarEngine,
  listCarEngines,
} from "@/server/carEngine";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = carEngineListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { carEngines, total } = await listCarEngines(parsed.data);
  return NextResponse.json({
    success: true,
    data: {
      carEngines,
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = carEngineCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const carEngine = await createCarEngine(parsed.data);
    return NextResponse.json({ success: true, data: { carEngine } }, { status: 201 });
  } catch (error) {
    // The model is read from the database to learn its calendar, so a bad
    // carModelId surfaces here rather than as a foreign-key crash.
    if (error instanceof CarEngineNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof CarEngineYearCalendarError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    throw error;
  }
}
