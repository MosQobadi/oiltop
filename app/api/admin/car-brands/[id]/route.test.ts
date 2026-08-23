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

const SLUG_PREFIX = "test-car-brand-id-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/car-brands/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestCarBrand(overrides: Record<string, unknown> = {}) {
  return prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nameEn: "Test Car Brand For ID Route",
      nameFa: "برند خودرو آزمایشی",
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
});

afterAll(async () => {
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/admin/car-brands/:id", () => {
  it("returns the car brand with modelCount", async () => {
    const carBrand = await createTestCarBrand();
    const res = await GET(requestWithBody("GET"), ctx(carBrand.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.carBrand.id).toBe(carBrand.id);
    expect(json.data.carBrand.modelCount).toBe(0);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const carBrand = await createTestCarBrand();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(carBrand.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("PATCH /api/admin/car-brands/:id", () => {
  it("updates fields and returns the updated car brand", async () => {
    const carBrand = await createTestCarBrand();
    const res = await PATCH(requestWithBody("PATCH", { nameEn: "Updated Name" }), ctx(carBrand.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carBrand.nameEn).toBe("Updated Name");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Doesn't matter" }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a duplicate slug", async () => {
    const carBrandA = await createTestCarBrand();
    const carBrandB = await createTestCarBrand();

    const res = await PATCH(requestWithBody("PATCH", { slug: carBrandA.slug }), ctx(carBrandB.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });
});

describe("DELETE /api/admin/car-brands/:id", () => {
  it("deletes a car brand with no car models", async () => {
    const carBrand = await createTestCarBrand();
    const res = await DELETE(requestWithBody("DELETE"), ctx(carBrand.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.carBrand.findUnique({ where: { id: carBrand.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("soft-fails with a clear error when the car brand has car models", async () => {
    const carBrand = await createTestCarBrand();
    const carModel = await prisma.carModel.create({
      data: {
        yearCalendar: "GREGORIAN",
        slug: `${SLUG_PREFIX}-model-${Date.now()}`,
        nameEn: "Test Car Model",
        nameFa: "مدل خودرو آزمایشی",
        carBrandId: carBrand.id,
        status: "ACTIVE",
      },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(carBrand.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/model/i);

    const stillExists = await prisma.carBrand.findUnique({
      where: { id: carBrand.id },
    });
    expect(stillExists).not.toBeNull();

    await prisma.carModel.delete({ where: { id: carModel.id } });
  });
});
