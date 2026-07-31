import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

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

const SKU_PREFIX = "TEST-INV-9-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/inventory");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

let engineOilCategory: { id: string };
let mobil1Brand: { id: string };

let productOutOfStock: { id: string; sku: string };
let productLowStock: { id: string; sku: string };
let productInStock: { id: string; sku: string };

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
      inventory: { create: { stock, lastUpdatedAt: new Date() } },
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

  productOutOfStock = await createTestProduct(`${SKU_PREFIX}-A`, 0);
  productLowStock = await createTestProduct(`${SKU_PREFIX}-B`, 9);
  productInStock = await createTestProduct(`${SKU_PREFIX}-C`, 10);
});

afterAll(async () => {
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
});

describe("GET /api/admin/inventory", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("derives OUT_OF_STOCK at exactly 0", async () => {
    const res = await GET(getRequest({ search: productOutOfStock.sku }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const item = json.data.items.find((i: { id: string }) => i.id === productOutOfStock.id);
    expect(item.stock).toBe(0);
    expect(item.status).toBe("OUT_OF_STOCK");
  });

  it("derives LOW_STOCK at exactly 9", async () => {
    const res = await GET(getRequest({ search: productLowStock.sku }));
    const json = await res.json();

    const item = json.data.items.find((i: { id: string }) => i.id === productLowStock.id);
    expect(item.stock).toBe(9);
    expect(item.status).toBe("LOW_STOCK");
  });

  it("derives IN_STOCK at exactly 10", async () => {
    const res = await GET(getRequest({ search: productInStock.sku }));
    const json = await res.json();

    const item = json.data.items.find((i: { id: string }) => i.id === productInStock.id);
    expect(item.stock).toBe(10);
    expect(item.status).toBe("IN_STOCK");
  });

  it("filters by derived status", async () => {
    const res = await GET(
      getRequest({ search: SKU_PREFIX, status: "LOW_STOCK", pageSize: "100" }),
    );
    const json = await res.json();

    expect(
      json.data.items.every((i: { status: string }) => i.status === "LOW_STOCK"),
    ).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === productLowStock.id)).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === productOutOfStock.id)).toBe(
      false,
    );
  });

  it("filters by category and brand", async () => {
    const res = await GET(
      getRequest({
        search: SKU_PREFIX,
        category: engineOilCategory.id,
        brand: mobil1Brand.id,
        pageSize: "100",
      }),
    );
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === productInStock.id)).toBe(true);
  });

  it("searches nameEn and sku, and includes category/brand names", async () => {
    const res = await GET(getRequest({ search: productOutOfStock.sku }));
    const json = await res.json();

    const item = json.data.items.find((i: { id: string }) => i.id === productOutOfStock.id);
    expect(item.category).toMatchObject({ id: engineOilCategory.id });
    expect(item.brand).toMatchObject({ id: mobil1Brand.id });
  });
});
