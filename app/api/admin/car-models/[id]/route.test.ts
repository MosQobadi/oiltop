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

const SLUG_PREFIX = "test-car-model-id-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/car-models/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let seededCarBrand: { id: string };

async function createTestCarModel(overrides: Record<string, unknown> = {}) {
  return prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nameEn: "Test Car Model For ID Route",
      nameFa: "مدل خودرو آزمایشی",
      carBrandId: seededCarBrand.id,
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
      nameEn: "Test Brand For ID Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("GET /api/admin/car-models/:id", () => {
  it("returns the car model with engineCount", async () => {
    const carModel = await createTestCarModel();
    const res = await GET(requestWithBody("GET"), ctx(carModel.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.carModel.id).toBe(carModel.id);
    expect(json.data.carModel.engineCount).toBe(0);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const carModel = await createTestCarModel();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(carModel.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("PATCH /api/admin/car-models/:id", () => {
  it("updates fields and returns the updated car model", async () => {
    const carModel = await createTestCarModel();
    const res = await PATCH(requestWithBody("PATCH", { nameEn: "Updated Name" }), ctx(carModel.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carModel.nameEn).toBe("Updated Name");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Doesn't matter" }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a duplicate slug within the same car brand", async () => {
    const carModelA = await createTestCarModel();
    const carModelB = await createTestCarModel();

    const res = await PATCH(requestWithBody("PATCH", { slug: carModelA.slug }), ctx(carModelB.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });
});

describe("DELETE /api/admin/car-models/:id", () => {
  it("deletes a car model with no car engines", async () => {
    const carModel = await createTestCarModel();
    const res = await DELETE(requestWithBody("DELETE"), ctx(carModel.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.carModel.findUnique({ where: { id: carModel.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("soft-fails with a clear error when the car model has car engines", async () => {
    const carModel = await createTestCarModel();
    const carEngine = await prisma.carEngine.create({
      data: {
        labelEn: `${SLUG_PREFIX} Engine`,
        labelFa: "موتور آزمایشی",
        carModelId: carModel.id,
        yearStart: 2020,
        fuelType: "PETROL",
        status: "ACTIVE",
      },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(carModel.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/engine/i);

    const stillExists = await prisma.carModel.findUnique({
      where: { id: carModel.id },
    });
    expect(stillExists).not.toBeNull();

    await prisma.carEngine.delete({ where: { id: carEngine.id } });
  });
});
