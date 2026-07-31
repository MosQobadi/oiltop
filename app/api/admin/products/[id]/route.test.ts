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

const SKU_PREFIX = "TEST-PROD-ID-7-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/products/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let engineOilCategory: { id: string };
let mobil1Brand: { id: string };

async function createTestProduct(overrides: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      sku: `${SKU_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nameEn: "Test Product For ID Route",
      nameFa: "محصول آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: mobil1Brand.id,
      price: 1000,
      discountPercent: 0,
      tags: [],
      oemPartNumbers: [],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
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

  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  mobil1Brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "mobil-1" } });
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.fitmentProfileItem.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
});

describe("GET /api/admin/products/:id", () => {
  it("returns the product with stock and finalPrice", async () => {
    const product = await createTestProduct({ price: 1000, discountPercent: 25 });
    const res = await GET(requestWithBody("GET"), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.product.id).toBe(product.id);
    expect(json.data.product.stock).toBe(0);
    expect(json.data.product.finalPrice).toBe(750);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const product = await createTestProduct();
    cookieJar.clear();
    const res = await GET(requestWithBody("GET"), ctx(product.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("PATCH /api/admin/products/:id", () => {
  it("updates fields and returns the updated product", async () => {
    const product = await createTestProduct();
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Updated Name" }),
      ctx(product.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.product.nameEn).toBe("Updated Name");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Doesn't matter" }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a duplicate SKU", async () => {
    const productA = await createTestProduct();
    const productB = await createTestProduct();

    const res = await PATCH(
      requestWithBody("PATCH", { sku: productA.sku }),
      ctx(productB.id),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });
});

describe("DELETE /api/admin/products/:id", () => {
  it("deletes a product with no order history or fitment references", async () => {
    const product = await createTestProduct();
    const res = await DELETE(requestWithBody("DELETE"), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.product.findUnique({ where: { id: product.id } });
    expect(found).toBeNull();
    const foundInventory = await prisma.inventory.findUnique({
      where: { productId: product.id },
    });
    expect(foundInventory).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("deactivates instead of deleting when the product has order history", async () => {
    const product = await createTestProduct();
    const order = await prisma.order.findFirstOrThrow();
    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: product.nameEn,
        priceSnapshot: product.price,
        quantity: 1,
        lineTotal: product.price,
      },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/order item/i);

    const stillExists = await prisma.product.findUnique({ where: { id: product.id } });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe("INACTIVE");

    await prisma.orderItem.delete({ where: { id: orderItem.id } });
  });

  it("deactivates instead of deleting and names the referencing fitment rows", async () => {
    const product = await createTestProduct();
    const profile = await prisma.fitmentProfile.create({
      data: { label: `${SKU_PREFIX} profile` },
    });
    const item = await prisma.fitmentProfileItem.create({
      data: {
        profileId: profile.id,
        categoryId: engineOilCategory.id,
        productId: product.id,
      },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/fitment profile item/i);
    expect(json.error).toContain(item.id);

    const stillExists = await prisma.product.findUnique({ where: { id: product.id } });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe("INACTIVE");

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
    await prisma.fitmentProfile.delete({ where: { id: profile.id } });
  });
});
