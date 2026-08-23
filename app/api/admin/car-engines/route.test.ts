import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET, POST } from "./route";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const SLUG_PREFIX = "test-car-engine-8-3";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/car-engines");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/car-engines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validCarEnginePayload(overrides: Record<string, unknown> = {}) {
  return {
    labelEn: "Test Car Engine 8.3",
    labelFa: "موتور آزمایشی",
    yearStart: 2015,
    yearEnd: 2020,
    fuelType: "PETROL",
    status: "ACTIVE",
    ...overrides,
  };
}

let seededCarBrand: { id: string };
let seededCarModelA: { id: string };
let seededCarModelB: { id: string };
let seededCarEngine: { labelEn: string; carModelId: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  seededCarBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Engines",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  seededCarModelA = await prisma.carModel.create({
    data: {
      yearCalendar: "GREGORIAN",
      slug: `${SLUG_PREFIX}-model-a`,
      nameEn: "Test Model A",
      nameFa: "مدل آزمایشی الف",
      carBrandId: seededCarBrand.id,
      status: "ACTIVE",
    },
  });
  seededCarModelB = await prisma.carModel.create({
    data: {
      yearCalendar: "GREGORIAN",
      slug: `${SLUG_PREFIX}-model-b`,
      nameEn: "Test Model B",
      nameFa: "مدل آزمایشی ب",
      carBrandId: seededCarBrand.id,
      status: "ACTIVE",
    },
  });

  seededCarEngine = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Seed Engine`,
      labelFa: "موتور بذر آزمایشی",
      carModelId: seededCarModelA.id,
      yearStart: 2010,
      yearEnd: 2015,
      fuelType: "DIESEL",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("GET /api/admin/car-engines", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest({ carModelId: seededCarModelA.id }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects a request without carModelId", async () => {
    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("scopes results to the given carModelId and returns total", async () => {
    const res = await GET(getRequest({ carModelId: seededCarModelA.id, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(
      json.data.carEngines.every(
        (e: { carModelId: string }) => e.carModelId === seededCarModelA.id,
      ),
    ).toBe(true);
    const seeded = json.data.carEngines.find(
      (e: { labelEn: string }) => e.labelEn === seededCarEngine.labelEn,
    );
    expect(seeded).toBeTruthy();
  });

  it("does not return engines from a different car model", async () => {
    const res = await GET(getRequest({ carModelId: seededCarModelB.id, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.carEngines.some((e: { labelEn: string }) => e.labelEn === seededCarEngine.labelEn),
    ).toBe(false);
  });

  it("filters by status", async () => {
    const res = await GET(
      getRequest({ carModelId: seededCarModelA.id, status: "ACTIVE", pageSize: "100" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carEngines.every((e: { status: string }) => e.status === "ACTIVE")).toBe(true);
  });

  it("searches against both labelEn and labelFa", async () => {
    const enRes = await GET(
      getRequest({ carModelId: seededCarModelA.id, search: seededCarEngine.labelEn }),
    );
    const enJson = await enRes.json();
    expect(
      enJson.data.carEngines.some(
        (e: { labelEn: string }) => e.labelEn === seededCarEngine.labelEn,
      ),
    ).toBe(true);

    const faRes = await GET(
      getRequest({ carModelId: seededCarModelA.id, search: "موتور بذر آزمایشی" }),
    );
    const faJson = await faRes.json();
    expect(
      faJson.data.carEngines.some(
        (e: { labelEn: string }) => e.labelEn === seededCarEngine.labelEn,
      ),
    ).toBe(true);
  });
});

describe("POST /api/admin/car-engines", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(postRequest(validCarEnginePayload({ carModelId: seededCarModelA.id })));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects an invalid body", async () => {
    const res = await POST(postRequest({ labelEn: "Missing fields" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("creates a car engine", async () => {
    const res = await POST(
      postRequest(
        validCarEnginePayload({
          carModelId: seededCarModelA.id,
          labelEn: `${SLUG_PREFIX} Created`,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.carEngine.carModelId).toBe(seededCarModelA.id);
  });

  it("allows creating a car engine with no yearEnd (still in production)", async () => {
    const res = await POST(
      postRequest(
        validCarEnginePayload({
          carModelId: seededCarModelA.id,
          labelEn: `${SLUG_PREFIX} No End Year`,
          yearEnd: undefined,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.carEngine.yearEnd).toBeNull();
  });

  it("rejects yearStart greater than yearEnd", async () => {
    const res = await POST(
      postRequest(
        validCarEnginePayload({
          carModelId: seededCarModelA.id,
          labelEn: `${SLUG_PREFIX} Bad Year Range`,
          yearStart: 2022,
          yearEnd: 2020,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  // The bug this pair exists to prevent: 1390 is an ordinary Jalali model year
  // and a car built in the 14th century if the model counts in Gregorian. The
  // calendar is read from the model in the database, never from the request.
  it("rejects a Jalali year on a Gregorian model", async () => {
    const res = await POST(
      postRequest(
        validCarEnginePayload({
          carModelId: seededCarModelA.id,
          labelEn: `${SLUG_PREFIX} Jalali On Gregorian`,
          yearStart: 1390,
          yearEnd: 1399,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Gregorian");
  });

  it("accepts a Jalali year on a Jalali model, and rejects a Gregorian one", async () => {
    const jalaliModel = await prisma.carModel.create({
      data: {
        yearCalendar: "JALALI",
        slug: `${SLUG_PREFIX}-model-jalali`,
        nameEn: "Test Model Jalali",
        nameFa: "مدل آزمایشی شمسی",
        carBrandId: seededCarBrand.id,
        status: "ACTIVE",
      },
    });

    const accepted = await POST(
      postRequest(
        validCarEnginePayload({
          carModelId: jalaliModel.id,
          labelEn: `${SLUG_PREFIX} Jalali OK`,
          yearStart: 1390,
          yearEnd: 1399,
        }),
      ),
    );
    expect(accepted.status).toBe(201);

    const rejected = await POST(
      postRequest(
        validCarEnginePayload({
          carModelId: jalaliModel.id,
          labelEn: `${SLUG_PREFIX} Gregorian On Jalali`,
          yearStart: 2015,
          yearEnd: 2020,
        }),
      ),
    );
    const json = await rejected.json();

    expect(rejected.status).toBe(400);
    expect(json.error).toContain("Jalali");
  });
});
