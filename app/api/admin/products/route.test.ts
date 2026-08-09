import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
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

const SKU_PREFIX = "TEST-PROD-7-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/products");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validProductPayload(overrides: Record<string, unknown> = {}) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    sku: `${SKU_PREFIX}-${unique}`,
    // Explicit and unique: every payload here shares one nameEn, so relying on
    // the auto-generated slug would make each create after the first a
    // duplicate-slug conflict.
    slug: `${SKU_PREFIX}-${unique}`.toLowerCase(),
    nameEn: "Test Product 7.1",
    nameFa: "محصول آزمایشی",
    price: 1000,
    discountPercent: 20,
    shortDescriptionEn: "Short desc",
    shortDescriptionFa: "توضیح کوتاه",
    longDescriptionEn: "Long desc",
    longDescriptionFa: "توضیح بلند",
    status: "ACTIVE",
    ...overrides,
  };
}

let engineOilCategory: { id: string };
let oilFilterCategory: { id: string };
let mobil1Brand: { id: string };
let castrolBrand: { id: string };
let boschBrand: { id: string };

let productActiveEngineOilMobil: { id: string; sku: string };
let productInactiveOilFilterBosch: { id: string; sku: string };
let productActiveEngineOilCastrolWithOem: { id: string; sku: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  oilFilterCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "oil-filter" },
  });
  mobil1Brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "mobil-1" } });
  castrolBrand = await prisma.brand.findUniqueOrThrow({ where: { slug: "castrol" } });
  boschBrand = await prisma.brand.findUniqueOrThrow({ where: { slug: "bosch" } });

  productActiveEngineOilMobil = await prisma.product.create({
    data: {
      sku: `${SKU_PREFIX}-A`,
      slug: `${SKU_PREFIX}-A`.toLowerCase(),
      nameEn: `${SKU_PREFIX} Mobil Engine Oil`,
      nameFa: "روغن موتور آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: mobil1Brand.id,
      price: 1000,
      discountPercent: 20,
      tags: [],
      oemPartNumbers: [],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: "ACTIVE",
    },
  });
  productInactiveOilFilterBosch = await prisma.product.create({
    data: {
      sku: `${SKU_PREFIX}-B`,
      slug: `${SKU_PREFIX}-B`.toLowerCase(),
      nameEn: `${SKU_PREFIX} Bosch Oil Filter`,
      nameFa: "فیلتر روغن آزمایشی",
      categoryId: oilFilterCategory.id,
      brandId: boschBrand.id,
      price: 500,
      discountPercent: 0,
      tags: [],
      oemPartNumbers: [],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: "INACTIVE",
    },
  });
  productActiveEngineOilCastrolWithOem = await prisma.product.create({
    data: {
      sku: `${SKU_PREFIX}-C`,
      slug: `${SKU_PREFIX}-C`.toLowerCase(),
      nameEn: `${SKU_PREFIX} Castrol Engine Oil`,
      nameFa: "روغن موتور کاسترول آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: castrolBrand.id,
      price: 2000,
      discountPercent: 0,
      tags: [],
      oemPartNumbers: [`${SKU_PREFIX}-OEM-1`],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.inventory.deleteMany({ where: { product: { sku: { startsWith: SKU_PREFIX } } } });
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
});

describe("GET /api/admin/products", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("lists products with category, brand, stock, and finalPrice", async () => {
    const res = await GET(getRequest({ search: productActiveEngineOilMobil.sku }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    const product = json.data.products.find(
      (p: { id: string }) => p.id === productActiveEngineOilMobil.id,
    );
    expect(product).toBeTruthy();
    expect(product.category).toMatchObject({ id: engineOilCategory.id });
    expect(product.brand).toMatchObject({ id: mobil1Brand.id });
    expect(product.stock).toBe(0);
    expect(product.price).toBe(1000);
    expect(product.finalPrice).toBe(800);
  });

  it("filters by category", async () => {
    const res = await GET(getRequest({ category: engineOilCategory.id, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.products.every(
        (p: { categoryId: string }) => p.categoryId === engineOilCategory.id,
      ),
    ).toBe(true);
    expect(
      json.data.products.some((p: { id: string }) => p.id === productActiveEngineOilMobil.id),
    ).toBe(true);
    expect(
      json.data.products.some((p: { id: string }) => p.id === productInactiveOilFilterBosch.id),
    ).toBe(false);
  });

  it("filters by brand", async () => {
    const res = await GET(getRequest({ brand: castrolBrand.id, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.products.every((p: { brandId: string }) => p.brandId === castrolBrand.id),
    ).toBe(true);
    expect(
      json.data.products.some(
        (p: { id: string }) => p.id === productActiveEngineOilCastrolWithOem.id,
      ),
    ).toBe(true);
  });

  it("filters by status", async () => {
    const res = await GET(getRequest({ status: "INACTIVE", pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.products.every((p: { status: string }) => p.status === "INACTIVE")).toBe(true);
    expect(
      json.data.products.some((p: { id: string }) => p.id === productInactiveOilFilterBosch.id),
    ).toBe(true);
  });

  it("combines category, brand, and status filters", async () => {
    const res = await GET(
      getRequest({
        category: engineOilCategory.id,
        brand: mobil1Brand.id,
        status: "ACTIVE",
        pageSize: "100",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.products.some((p: { id: string }) => p.id === productActiveEngineOilMobil.id),
    ).toBe(true);
    expect(
      json.data.products.some(
        (p: { id: string }) => p.id === productActiveEngineOilCastrolWithOem.id,
      ),
    ).toBe(false);
  });

  it("searches nameEn, nameFa, and sku", async () => {
    const byName = await GET(getRequest({ search: `${SKU_PREFIX} Mobil Engine Oil` }));
    const byNameJson = await byName.json();
    expect(
      byNameJson.data.products.some((p: { id: string }) => p.id === productActiveEngineOilMobil.id),
    ).toBe(true);

    const byNameFa = await GET(getRequest({ search: "روغن موتور آزمایشی" }));
    const byNameFaJson = await byNameFa.json();
    expect(
      byNameFaJson.data.products.some(
        (p: { id: string }) => p.id === productActiveEngineOilMobil.id,
      ),
    ).toBe(true);

    const bySku = await GET(getRequest({ search: productActiveEngineOilMobil.sku }));
    const bySkuJson = await bySku.json();
    expect(
      bySkuJson.data.products.some((p: { id: string }) => p.id === productActiveEngineOilMobil.id),
    ).toBe(true);
  });

  it("searches oemPartNumbers", async () => {
    const res = await GET(getRequest({ search: `${SKU_PREFIX}-OEM-1` }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.products.some(
        (p: { id: string }) => p.id === productActiveEngineOilCastrolWithOem.id,
      ),
    ).toBe(true);
  });
});

describe("POST /api/admin/products", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(postRequest(validProductPayload()));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects an invalid body", async () => {
    const res = await POST(postRequest({ nameEn: "Missing fields" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("creates a product with a linked zero-stock inventory row", async () => {
    const res = await POST(
      postRequest(
        validProductPayload({
          categoryId: engineOilCategory.id,
          brandId: mobil1Brand.id,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.product.stock).toBe(0);
    expect(json.data.product.finalPrice).toBe(800);

    const inventory = await prisma.inventory.findUnique({
      where: { productId: json.data.product.id },
    });
    expect(inventory).toBeTruthy();
    expect(inventory?.stock).toBe(0);
  });

  it("auto-generates the slug from nameEn when one isn't supplied", async () => {
    const payload: Record<string, unknown> = validProductPayload({
      nameEn: `${SKU_PREFIX} Auto Slug ${Date.now()}`,
      categoryId: engineOilCategory.id,
      brandId: mobil1Brand.id,
    });
    delete payload.slug;

    const res = await POST(postRequest(payload));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.product.slug).toBe(slugify(payload.nameEn as string));
  });

  it("rejects a duplicate slug with a clear error", async () => {
    const slug = `${SKU_PREFIX}-dup-slug`.toLowerCase();
    const first = await POST(
      postRequest(
        validProductPayload({ slug, categoryId: engineOilCategory.id, brandId: mobil1Brand.id }),
      ),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(
        validProductPayload({ slug, categoryId: engineOilCategory.id, brandId: mobil1Brand.id }),
      ),
    );
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/slug .* already exists/i);
  });

  it("rejects a duplicate SKU with a clear error", async () => {
    const sku = `${SKU_PREFIX}-dup`;
    const first = await POST(
      postRequest(
        validProductPayload({ sku, categoryId: engineOilCategory.id, brandId: mobil1Brand.id }),
      ),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(
        validProductPayload({ sku, categoryId: engineOilCategory.id, brandId: mobil1Brand.id }),
      ),
    );
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });
});
