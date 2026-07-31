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

const SLUG_PREFIX = "test-fitment-8-4";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/fitment");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let seededCarBrand: { id: string };
let seededCarModel: { id: string };
let seededCarEngineA: { id: string };
let seededCarEngineB: { id: string };
let engineOilCategory: { id: string; nameEn: string };
let oilFilterCategory: { id: string };
let testProduct: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  seededCarBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Fitment",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  seededCarModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Fitment",
      nameFa: "مدل آزمایشی",
      carBrandId: seededCarBrand.id,
      status: "ACTIVE",
    },
  });
  seededCarEngineA = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine A`,
      labelFa: "موتور آزمایشی الف",
      carModelId: seededCarModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  seededCarEngineB = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine B`,
      labelFa: "موتور آزمایشی ب",
      carModelId: seededCarModel.id,
      yearStart: 2018,
      yearEnd: 2023,
      fuelType: "DIESEL",
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
    where: { carEngineId: { in: [seededCarEngineA.id, seededCarEngineB.id] } },
  });
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

function validFitmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    carEngineId: seededCarEngineA.id,
    categoryId: engineOilCategory.id,
    climate: "STANDARD",
    specNote: "Use manufacturer-specified viscosity",
    ...overrides,
  };
}

describe("GET /api/admin/fitment", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("scopes results by carEngineId and returns joined fields", async () => {
    const seeded = await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: seededCarEngineA.id,
        categoryId: engineOilCategory.id,
        climate: "STANDARD",
        specNote: `${SLUG_PREFIX} spec note`,
        priority: 1,
      },
    });

    const res = await GET(getRequest({ carEngineId: seededCarEngineA.id }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(
      json.data.fitmentRecommendations.every(
        (r: { carEngine: { id: string } }) => r.carEngine.id === seededCarEngineA.id,
      ),
    ).toBe(true);
    const found = json.data.fitmentRecommendations.find(
      (r: { id: string }) => r.id === seeded.id,
    );
    expect(found).toBeTruthy();
    expect(found.category.nameEn).toBe(engineOilCategory.nameEn);
    expect(found.carEngine.labelEn).toBe(`${SLUG_PREFIX} Engine A`);
    expect(found.product).toBeNull();
    expect(found.specNote).toBe(`${SLUG_PREFIX} spec note`);

    await prisma.fitmentRecommendation.delete({ where: { id: seeded.id } });
  });

  it("does not return recommendations from a different car engine", async () => {
    const seeded = await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: seededCarEngineA.id,
        categoryId: engineOilCategory.id,
        specNote: `${SLUG_PREFIX} isolation check`,
      },
    });

    const res = await GET(getRequest({ carEngineId: seededCarEngineB.id }));
    const json = await res.json();

    expect(
      json.data.fitmentRecommendations.some((r: { id: string }) => r.id === seeded.id),
    ).toBe(false);

    await prisma.fitmentRecommendation.delete({ where: { id: seeded.id } });
  });

  it("filters by categoryId", async () => {
    const seeded = await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: seededCarEngineA.id,
        categoryId: oilFilterCategory.id,
        specNote: `${SLUG_PREFIX} filter category`,
      },
    });

    const res = await GET(
      getRequest({ carEngineId: seededCarEngineA.id, categoryId: oilFilterCategory.id }),
    );
    const json = await res.json();

    expect(
      json.data.fitmentRecommendations.every(
        (r: { category: { id: string } }) => r.category.id === oilFilterCategory.id,
      ),
    ).toBe(true);
    expect(
      json.data.fitmentRecommendations.some((r: { id: string }) => r.id === seeded.id),
    ).toBe(true);

    await prisma.fitmentRecommendation.delete({ where: { id: seeded.id } });
  });
});

describe("POST /api/admin/fitment", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(postRequest(validFitmentPayload()));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects an invalid body (missing categoryId)", async () => {
    const res = await POST(postRequest({ carEngineId: seededCarEngineA.id }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("creates a spec-only recommendation (no product)", async () => {
    const res = await POST(postRequest(validFitmentPayload()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.fitmentRecommendation.product).toBeNull();
    expect(json.data.fitmentRecommendation.specNote).toBe(
      "Use manufacturer-specified viscosity",
    );

    await prisma.fitmentRecommendation.delete({
      where: { id: json.data.fitmentRecommendation.id },
    });
  });

  it("creates a recommendation with a product and no spec note", async () => {
    const res = await POST(
      postRequest(
        validFitmentPayload({ specNote: undefined, productId: testProduct.id }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.fitmentRecommendation.product.id).toBe(testProduct.id);

    await prisma.fitmentRecommendation.delete({
      where: { id: json.data.fitmentRecommendation.id },
    });
  });

  it("rejects when neither productId nor specNote is present", async () => {
    const res = await POST(
      postRequest(validFitmentPayload({ specNote: undefined, productId: undefined })),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("rejects climate other than STANDARD when the category is not ENGINE_OIL", async () => {
    const res = await POST(
      postRequest(
        validFitmentPayload({ categoryId: oilFilterCategory.id, climate: "HOT" }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("accepts a HOT climate when the category is ENGINE_OIL", async () => {
    const res = await POST(
      postRequest(validFitmentPayload({ categoryId: engineOilCategory.id, climate: "HOT" })),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.fitmentRecommendation.climate).toBe("HOT");

    await prisma.fitmentRecommendation.delete({
      where: { id: json.data.fitmentRecommendation.id },
    });
  });
});
