import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE, GET, PATCH } from "./route";

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

const SLUG_PREFIX = "test-car-engine-id-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/car-engines/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let seededCarBrand: { id: string };
let seededCarModel: { id: string };

async function createTestCarEngine(overrides: Record<string, unknown> = {}) {
  return prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine`,
      labelFa: "موتور آزمایشی",
      carModelId: seededCarModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  seededCarBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Engine ID Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  seededCarModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Engine ID Route",
      nameFa: "مدل آزمایشی",
      carBrandId: seededCarBrand.id,
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.carEngineFitmentProfile.deleteMany({
    where: { carEngine: { labelEn: { startsWith: SLUG_PREFIX } } },
  });
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("GET /api/admin/car-engines/:id", () => {
  it("returns the car engine", async () => {
    const carEngine = await createTestCarEngine();
    const res = await GET(requestWithBody("GET"), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.carEngine.id).toBe(carEngine.id);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const carEngine = await createTestCarEngine();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(carEngine.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("PATCH /api/admin/car-engines/:id", () => {
  it("updates fields and returns the updated car engine", async () => {
    const carEngine = await createTestCarEngine();
    const res = await PATCH(requestWithBody("PATCH", { engineCode: "2ZR-FE" }), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carEngine.engineCode).toBe("2ZR-FE");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", { engineCode: "Doesn't matter" }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects yearStart greater than yearEnd on update", async () => {
    const carEngine = await createTestCarEngine();
    const res = await PATCH(
      requestWithBody("PATCH", { yearStart: 2025, yearEnd: 2020 }),
      ctx(carEngine.id),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("nulls yearEnd when explicitly set to null (still in production)", async () => {
    const carEngine = await createTestCarEngine({ yearEnd: 2020 });
    const res = await PATCH(requestWithBody("PATCH", { yearEnd: null }), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carEngine.yearEnd).toBeNull();
  });
});

describe("DELETE /api/admin/car-engines/:id", () => {
  it("deletes a car engine with no fitment profiles attached", async () => {
    const carEngine = await createTestCarEngine();
    const res = await DELETE(requestWithBody("DELETE"), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.carEngine.findUnique({ where: { id: carEngine.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("soft-fails with a clear error when the car engine has a fitment profile attached", async () => {
    const carEngine = await createTestCarEngine();
    const profile = await prisma.fitmentProfile.create({
      data: { label: `${SLUG_PREFIX} profile` },
    });
    const link = await prisma.carEngineFitmentProfile.create({
      data: { carEngineId: carEngine.id, profileId: profile.id },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/fitment profile/i);

    const stillExists = await prisma.carEngine.findUnique({
      where: { id: carEngine.id },
    });
    expect(stillExists).not.toBeNull();

    await prisma.carEngineFitmentProfile.delete({ where: { id: link.id } });
    await prisma.fitmentProfile.delete({ where: { id: profile.id } });
  });
});
