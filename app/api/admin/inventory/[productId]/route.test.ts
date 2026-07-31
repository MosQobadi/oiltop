import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH } from "./route";

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

const SKU_PREFIX = "TEST-INV-ID-9-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function patchRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/inventory/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(productId: string) {
  return { params: Promise.resolve({ productId }) };
}

let engineOilCategory: { id: string };
let mobil1Brand: { id: string };

async function createTestProduct(sku: string, stock: number) {
  return prisma.product.create({
    data: {
      sku,
      nameEn: `${sku} name`,
      nameFa: "محصول آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: mobil1Brand.id,
      price: 1000,
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: "ACTIVE",
      inventory: { create: { stock, lastUpdatedAt: new Date(0) } },
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
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
});

describe("PATCH /api/admin/inventory/:productId", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await PATCH(patchRequest({ addStock: 5 }), ctx("does-not-exist"));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects addStock <= 0", async () => {
    const product = await createTestProduct(`${SKU_PREFIX}-A`, 5);
    const res = await PATCH(patchRequest({ addStock: 0 }), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("returns 404 for an unknown product", async () => {
    const res = await PATCH(patchRequest({ addStock: 5 }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("crosses the LOW_STOCK -> IN_STOCK boundary, updates lastUpdatedAt, and returns the new total", async () => {
    const product = await createTestProduct(`${SKU_PREFIX}-B`, 8);
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { productId: product.id },
    });

    const res = await PATCH(patchRequest({ addStock: 2 }), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.inventory.stock).toBe(10);
    expect(json.data.inventory.status).toBe("IN_STOCK");

    const after = await prisma.inventory.findUniqueOrThrow({
      where: { productId: product.id },
    });
    expect(after.lastUpdatedAt.getTime()).toBeGreaterThan(before.lastUpdatedAt.getTime());
  });

  it("crosses the OUT_OF_STOCK -> LOW_STOCK boundary", async () => {
    const product = await createTestProduct(`${SKU_PREFIX}-C`, 0);

    const res = await PATCH(patchRequest({ addStock: 9 }), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.inventory.stock).toBe(9);
    expect(json.data.inventory.status).toBe("LOW_STOCK");
  });
});
