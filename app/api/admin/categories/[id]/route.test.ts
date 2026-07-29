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

const SLUG_PREFIX = "test-cat-id-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/categories/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestCategory(overrides: Record<string, unknown> = {}) {
  return prisma.category.create({
    data: {
      slug: `${SLUG_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nameEn: "Test Category For ID Route",
      nameFa: "دسته آزمایشی",
      tags: ["test"],
      shortDescriptionEn: "Short desc",
      shortDescriptionFa: "توضیح کوتاه",
      longDescriptionEn: "Long desc",
      longDescriptionFa: "توضیح بلند",
      status: "ACTIVE",
      partType: "ACCESSORY",
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
  await prisma.category.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/admin/categories/:id", () => {
  it("returns the category with productCount", async () => {
    const category = await createTestCategory();
    const res = await GET(requestWithBody("GET"), ctx(category.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.category.id).toBe(category.id);
    expect(json.data.category.productCount).toBe(0);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const category = await createTestCategory();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(category.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("PATCH /api/admin/categories/:id", () => {
  it("updates fields and returns the updated category", async () => {
    const category = await createTestCategory();
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Updated Name" }),
      ctx(category.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.category.nameEn).toBe("Updated Name");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Doesn't matter" }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a duplicate slug", async () => {
    const categoryA = await createTestCategory();
    const categoryB = await createTestCategory();

    const res = await PATCH(
      requestWithBody("PATCH", { slug: categoryA.slug }),
      ctx(categoryB.id),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });

  it("forces filterKind to null when partType changes away from FILTER", async () => {
    const category = await createTestCategory({
      partType: "FILTER",
      filterKind: "OIL_FILTER",
    });

    const res = await PATCH(
      requestWithBody("PATCH", { partType: "ACCESSORY" }),
      ctx(category.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.category.partType).toBe("ACCESSORY");
    expect(json.data.category.filterKind).toBeNull();
  });
});

describe("DELETE /api/admin/categories/:id", () => {
  it("deletes a category with no products", async () => {
    const category = await createTestCategory();
    const res = await DELETE(requestWithBody("DELETE"), ctx(category.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.category.findUnique({ where: { id: category.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("soft-fails with a clear error when the category has products", async () => {
    const category = await createTestCategory();
    const brand = await prisma.brand.findFirstOrThrow();
    const product = await prisma.product.create({
      data: {
        sku: `${SLUG_PREFIX}-sku-${Date.now()}`,
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

    const res = await DELETE(requestWithBody("DELETE"), ctx(category.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/product/i);

    const stillExists = await prisma.category.findUnique({
      where: { id: category.id },
    });
    expect(stillExists).not.toBeNull();

    await prisma.product.delete({ where: { id: product.id } });
  });
});
