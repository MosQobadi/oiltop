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

const SLUG_PREFIX = "test-brand-id-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/brands/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestBrand(overrides: Record<string, unknown> = {}) {
  return prisma.brand.create({
    data: {
      slug: `${SLUG_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nameEn: "Test Brand For ID Route",
      nameFa: "برند آزمایشی",
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
  await prisma.product.deleteMany({ where: { sku: { startsWith: SLUG_PREFIX } } });
  await prisma.brand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/admin/brands/:id", () => {
  it("returns the brand with productCount", async () => {
    const brand = await createTestBrand();
    const res = await GET(requestWithBody("GET"), ctx(brand.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.brand.id).toBe(brand.id);
    expect(json.data.brand.productCount).toBe(0);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const brand = await createTestBrand();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(brand.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("PATCH /api/admin/brands/:id", () => {
  it("updates fields and returns the updated brand", async () => {
    const brand = await createTestBrand();
    const res = await PATCH(requestWithBody("PATCH", { nameEn: "Updated Name" }), ctx(brand.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.brand.nameEn).toBe("Updated Name");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Doesn't matter" }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a duplicate slug", async () => {
    const brandA = await createTestBrand();
    const brandB = await createTestBrand();

    const res = await PATCH(requestWithBody("PATCH", { slug: brandA.slug }), ctx(brandB.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });
});

describe("DELETE /api/admin/brands/:id", () => {
  it("deletes a brand with no products", async () => {
    const brand = await createTestBrand();
    const res = await DELETE(requestWithBody("DELETE"), ctx(brand.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.brand.findUnique({ where: { id: brand.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("soft-fails with a clear error when the brand has products", async () => {
    const brand = await createTestBrand();
    const category = await prisma.category.findFirstOrThrow();
    const product = await prisma.product.create({
      data: {
        sku: `${SLUG_PREFIX}-sku-${Date.now()}`,
        slug: `${SLUG_PREFIX}-slug-${Date.now()}`,
        nameEn: "Test Product",
        nameFa: "محصول آزمایشی",
        categoryId: category.id,
        brandId: brand.id,
        price: 100_000,
        discountPercent: 0,
        tags: [],
        oemPartNumbers: [],
        shortDescriptionEn: "Short",
        shortDescriptionFa: "کوتاه",
        longDescriptionEn: "Long",
        longDescriptionFa: "بلند",
        status: "ACTIVE",
      },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(brand.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/product/i);

    const stillExists = await prisma.brand.findUnique({
      where: { id: brand.id },
    });
    expect(stillExists).not.toBeNull();

    await prisma.product.delete({ where: { id: product.id } });
  });
});
