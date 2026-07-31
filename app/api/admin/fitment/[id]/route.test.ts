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

const SLUG_PREFIX = "test-fitment-id-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment/x", {
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
let seededCarEngine: { id: string };
let engineOilCategory: { id: string };
let oilFilterCategory: { id: string };
let testProduct: { id: string };

async function createTestFitmentRecommendation(overrides: Record<string, unknown> = {}) {
  return prisma.fitmentRecommendation.create({
    data: {
      carEngineId: seededCarEngine.id,
      categoryId: engineOilCategory.id,
      climate: "STANDARD",
      specNote: `${SLUG_PREFIX} spec note`,
      priority: 0,
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
      nameEn: "Test Brand For Fitment ID Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  seededCarModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Fitment ID Route",
      nameFa: "مدل آزمایشی",
      carBrandId: seededCarBrand.id,
      status: "ACTIVE",
    },
  });
  seededCarEngine = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine`,
      labelFa: "موتور آزمایشی",
      carModelId: seededCarModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  oilFilterCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "oil-filter" },
  });
  testProduct = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
  });
});

afterAll(async () => {
  await prisma.fitmentRecommendation.deleteMany({
    where: { carEngineId: seededCarEngine.id },
  });
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("GET /api/admin/fitment/:id", () => {
  it("returns the fitment recommendation with joined fields", async () => {
    const fitment = await createTestFitmentRecommendation();
    const res = await GET(requestWithBody("GET"), ctx(fitment.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.fitmentRecommendation.id).toBe(fitment.id);
    expect(json.data.fitmentRecommendation.category.id).toBe(engineOilCategory.id);
    expect(json.data.fitmentRecommendation.carEngine.id).toBe(seededCarEngine.id);

    await prisma.fitmentRecommendation.delete({ where: { id: fitment.id } });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const fitment = await createTestFitmentRecommendation();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(fitment.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

    await prisma.fitmentRecommendation.delete({ where: { id: fitment.id } });
  });
});

describe("PATCH /api/admin/fitment/:id", () => {
  it("updates fields and returns the updated recommendation", async () => {
    const fitment = await createTestFitmentRecommendation();
    const res = await PATCH(requestWithBody("PATCH", { priority: 5 }), ctx(fitment.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.fitmentRecommendation.priority).toBe(5);

    await prisma.fitmentRecommendation.delete({ where: { id: fitment.id } });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(requestWithBody("PATCH", { priority: 1 }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects a non-STANDARD climate against the recommendation's existing (unchanged) category when it isn't ENGINE_OIL", async () => {
    const fitment = await createTestFitmentRecommendation({
      categoryId: oilFilterCategory.id,
      climate: "STANDARD",
      specNote: `${SLUG_PREFIX} filter spec`,
    });

    const res = await PATCH(requestWithBody("PATCH", { climate: "HOT" }), ctx(fitment.id));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);

    await prisma.fitmentRecommendation.delete({ where: { id: fitment.id } });
  });

  it("checks the climate rule against a newly-supplied categoryId in the same patch", async () => {
    const fitment = await createTestFitmentRecommendation({
      categoryId: oilFilterCategory.id,
      climate: "STANDARD",
      specNote: `${SLUG_PREFIX} switch to oil`,
    });

    const res = await PATCH(
      requestWithBody("PATCH", { categoryId: engineOilCategory.id, climate: "HOT" }),
      ctx(fitment.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.fitmentRecommendation.climate).toBe("HOT");
    expect(json.data.fitmentRecommendation.category.id).toBe(engineOilCategory.id);

    await prisma.fitmentRecommendation.delete({ where: { id: fitment.id } });
  });

  it("allows switching from a product back to spec-only by explicitly clearing productId", async () => {
    const fitment = await createTestFitmentRecommendation({
      productId: testProduct.id,
      specNote: null,
    });

    const res = await PATCH(
      requestWithBody("PATCH", {
        productId: null,
        specNote: `${SLUG_PREFIX} now spec-only`,
      }),
      ctx(fitment.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.fitmentRecommendation.product).toBeNull();
    expect(json.data.fitmentRecommendation.specNote).toBe(`${SLUG_PREFIX} now spec-only`);

    await prisma.fitmentRecommendation.delete({ where: { id: fitment.id } });
  });
});

describe("DELETE /api/admin/fitment/:id", () => {
  it("deletes the fitment recommendation", async () => {
    const fitment = await createTestFitmentRecommendation();
    const res = await DELETE(requestWithBody("DELETE"), ctx(fitment.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.fitmentRecommendation.findUnique({
      where: { id: fitment.id },
    });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });
});
