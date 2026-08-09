import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).
//
// Every assertion runs against fixtures created here rather than seeded rows:
// stock levels in a dev database drift as the admin Inventory screen is used,
// and the stock-status assertions below need exact values.

const PREFIX = "test-sf-plp";
// Shared by every visible fixture's nameEn so `search` can scope a query to
// just this test's products.
const NAME_TOKEN = "Tsfplp";

function getRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/storefront/products");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

async function listSlugs(params: Record<string, string>) {
  const res = await GET(getRequest({ search: NAME_TOKEN, pageSize: "100", ...params }));
  const json = await res.json();
  expect(res.status).toBe(200);
  return json.data.products.map((p: { slug: string }) => p.slug) as string[];
}

let oilCategoryId: string;
let filterCategoryId: string;
let brandAId: string;

interface ProductFixture {
  key: string;
  categoryId: () => string;
  brandId: () => string;
  price: number;
  discountPercent: number;
  stock: number;
  status: "ACTIVE" | "INACTIVE";
  oemPartNumbers?: string[];
}

async function createProduct(fixture: ProductFixture) {
  return prisma.product.create({
    data: {
      sku: `${PREFIX}-${fixture.key}`,
      slug: `${PREFIX}-${fixture.key}`,
      nameEn: `${NAME_TOKEN} ${fixture.key}`,
      nameFa: `محصول ${fixture.key}`,
      categoryId: fixture.categoryId(),
      brandId: fixture.brandId(),
      price: fixture.price,
      discountPercent: fixture.discountPercent,
      oemPartNumbers: fixture.oemPartNumbers ?? [],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: fixture.status,
      inventory: { create: { stock: fixture.stock, lastUpdatedAt: new Date() } },
    },
  });
}

beforeAll(async () => {
  const oilCategory = await prisma.category.create({
    data: {
      slug: `${PREFIX}-oil`,
      nameEn: "PLP Test Engine Oil",
      nameFa: "روغن آزمایشی",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "ENGINE_OIL",
      status: "ACTIVE",
    },
  });
  const filterCategory = await prisma.category.create({
    data: {
      slug: `${PREFIX}-air-filter`,
      nameEn: "PLP Test Air Filter",
      nameFa: "فیلتر هوا آزمایشی",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "FILTER",
      filterKind: "AIR_FILTER",
      status: "ACTIVE",
    },
  });
  const inactiveCategory = await prisma.category.create({
    data: {
      slug: `${PREFIX}-inactive-cat`,
      nameEn: "PLP Test Inactive Category",
      nameFa: "دسته غیرفعال",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "OTHER",
      status: "INACTIVE",
    },
  });

  const brandA = await prisma.brand.create({
    data: {
      slug: `${PREFIX}-brand-a`,
      nameEn: "PLP Test Brand A",
      nameFa: "برند الف",
      status: "ACTIVE",
    },
  });
  const brandB = await prisma.brand.create({
    data: {
      slug: `${PREFIX}-brand-b`,
      nameEn: "PLP Test Brand B",
      nameFa: "برند ب",
      status: "ACTIVE",
    },
  });
  const inactiveBrand = await prisma.brand.create({
    data: {
      slug: `${PREFIX}-brand-inactive`,
      nameEn: "PLP Test Inactive Brand",
      nameFa: "برند غیرفعال",
      status: "INACTIVE",
    },
  });

  oilCategoryId = oilCategory.id;
  filterCategoryId = filterCategory.id;
  brandAId = brandA.id;

  // finalPrice ordering (500 < 600 < 800) deliberately differs from raw price
  // ordering (500 < 1000 < 2000), so a price sort that ignored discounts would
  // fail the sort assertions below.
  await createProduct({
    key: "oil-a",
    categoryId: () => oilCategory.id,
    brandId: () => brandA.id,
    price: 1000,
    discountPercent: 20,
    stock: 40,
    status: "ACTIVE",
    oemPartNumbers: [`${PREFIX}-OEM-1`],
  });
  await createProduct({
    key: "filter-a",
    categoryId: () => filterCategory.id,
    brandId: () => brandA.id,
    price: 500,
    discountPercent: 0,
    stock: 5,
    status: "ACTIVE",
  });
  await createProduct({
    key: "filter-b",
    categoryId: () => filterCategory.id,
    brandId: () => brandB.id,
    price: 2000,
    discountPercent: 70,
    stock: 0,
    status: "ACTIVE",
  });
  // The three below must never appear in a public response.
  await createProduct({
    key: "inactive-product",
    categoryId: () => oilCategory.id,
    brandId: () => brandA.id,
    price: 100,
    discountPercent: 0,
    stock: 10,
    status: "INACTIVE",
  });
  await createProduct({
    key: "inactive-category",
    categoryId: () => inactiveCategory.id,
    brandId: () => brandA.id,
    price: 100,
    discountPercent: 0,
    stock: 10,
    status: "ACTIVE",
  });
  await createProduct({
    key: "inactive-brand",
    categoryId: () => oilCategory.id,
    brandId: () => inactiveBrand.id,
    price: 100,
    discountPercent: 0,
    stock: 10,
    status: "ACTIVE",
  });
});

afterAll(async () => {
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: PREFIX } } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
});

describe("GET /api/storefront/products", () => {
  it("lists active products unauthenticated, with pagination metadata", async () => {
    const res = await GET(getRequest({ search: NAME_TOKEN, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.page).toBe(1);
    expect(json.data.pageSize).toBe(100);
    expect(json.data.total).toBe(3);
  });

  it("hides inactive products and products behind an inactive category or brand", async () => {
    const slugs = await listSlugs({});

    expect(slugs.sort()).toEqual([`${PREFIX}-filter-a`, `${PREFIX}-filter-b`, `${PREFIX}-oil-a`]);
  });

  it("computes finalPrice from price and discountPercent", async () => {
    const res = await GET(getRequest({ search: `${NAME_TOKEN} oil-a` }));
    const json = await res.json();
    const product = json.data.products[0];

    expect(product.price).toBe(1000);
    expect(product.discountPercent).toBe(20);
    expect(product.finalPrice).toBe(800);
  });

  it("returns a stock status instead of a raw stock count", async () => {
    const res = await GET(getRequest({ search: NAME_TOKEN, pageSize: "100" }));
    const json = await res.json();

    const bySlug = new Map<string, { stockStatus: string | null; stock?: number }>(
      json.data.products.map((p: { slug: string }) => [p.slug, p]),
    );

    // 40 in stock — no badge, and never the number itself.
    expect(bySlug.get(`${PREFIX}-oil-a`)!.stockStatus).toBeNull();
    expect(bySlug.get(`${PREFIX}-filter-a`)!.stockStatus).toBe("LOW_STOCK");
    expect(bySlug.get(`${PREFIX}-filter-b`)!.stockStatus).toBe("OUT_OF_STOCK");

    for (const product of json.data.products) {
      expect(product).not.toHaveProperty("stock");
      expect(product).not.toHaveProperty("inventory");
    }
  });

  it("filters by category, by id and by slug alike", async () => {
    expect(await listSlugs({ category: filterCategoryId })).toEqual(
      expect.arrayContaining([`${PREFIX}-filter-a`, `${PREFIX}-filter-b`]),
    );
    expect((await listSlugs({ category: filterCategoryId })).sort()).toEqual([
      `${PREFIX}-filter-a`,
      `${PREFIX}-filter-b`,
    ]);
    expect((await listSlugs({ category: `${PREFIX}-air-filter` })).sort()).toEqual([
      `${PREFIX}-filter-a`,
      `${PREFIX}-filter-b`,
    ]);
  });

  it("filters by brand", async () => {
    expect((await listSlugs({ brand: brandAId })).sort()).toEqual([
      `${PREFIX}-filter-a`,
      `${PREFIX}-oil-a`,
    ]);
    expect(await listSlugs({ brand: `${PREFIX}-brand-b` })).toEqual([`${PREFIX}-filter-b`]);
  });

  it("filters by partType and filterKind", async () => {
    expect(await listSlugs({ partType: "ENGINE_OIL" })).toEqual([`${PREFIX}-oil-a`]);
    expect((await listSlugs({ partType: "FILTER" })).sort()).toEqual([
      `${PREFIX}-filter-a`,
      `${PREFIX}-filter-b`,
    ]);
    expect((await listSlugs({ filterKind: "AIR_FILTER" })).sort()).toEqual([
      `${PREFIX}-filter-a`,
      `${PREFIX}-filter-b`,
    ]);
    expect(await listSlugs({ filterKind: "OIL_FILTER" })).toEqual([]);
  });

  it("combines category and brand filters", async () => {
    expect(await listSlugs({ category: `${PREFIX}-air-filter`, brand: brandAId })).toEqual([
      `${PREFIX}-filter-a`,
    ]);

    expect(await listSlugs({ category: oilCategoryId, brand: `${PREFIX}-brand-b` })).toEqual([]);
  });

  it("searches nameEn, nameFa, and exact OEM part numbers", async () => {
    expect(await listSlugs({ search: `${NAME_TOKEN} oil-a` })).toEqual([`${PREFIX}-oil-a`]);

    const byNameFa = await GET(getRequest({ search: "محصول oil-a" }));
    const byNameFaJson = await byNameFa.json();
    expect(byNameFaJson.data.products.map((p: { slug: string }) => p.slug)).toEqual([
      `${PREFIX}-oil-a`,
    ]);

    const byOem = await GET(getRequest({ search: `${PREFIX}-OEM-1` }));
    const byOemJson = await byOem.json();
    expect(byOemJson.data.products.map((p: { slug: string }) => p.slug)).toEqual([
      `${PREFIX}-oil-a`,
    ]);
  });

  it("sorts by finalPrice, not by the pre-discount price", async () => {
    expect(await listSlugs({ sort: "price-asc" })).toEqual([
      `${PREFIX}-filter-a`, // 500
      `${PREFIX}-filter-b`, // 2000 - 70% = 600
      `${PREFIX}-oil-a`, // 1000 - 20% = 800
    ]);

    expect(await listSlugs({ sort: "price-desc" })).toEqual([
      `${PREFIX}-oil-a`,
      `${PREFIX}-filter-b`,
      `${PREFIX}-filter-a`,
    ]);
  });

  it("paginates a price-sorted list without losing the ordering", async () => {
    const firstPage = await GET(
      getRequest({ search: NAME_TOKEN, sort: "price-asc", page: "1", pageSize: "2" }),
    );
    const firstJson = await firstPage.json();
    expect(firstJson.data.total).toBe(3);
    expect(firstJson.data.products.map((p: { slug: string }) => p.slug)).toEqual([
      `${PREFIX}-filter-a`,
      `${PREFIX}-filter-b`,
    ]);

    const secondPage = await GET(
      getRequest({ search: NAME_TOKEN, sort: "price-asc", page: "2", pageSize: "2" }),
    );
    const secondJson = await secondPage.json();
    expect(secondJson.data.products.map((p: { slug: string }) => p.slug)).toEqual([
      `${PREFIX}-oil-a`,
    ]);
  });

  it("rejects an unknown sort or partType with a 400", async () => {
    const badSort = await GET(getRequest({ sort: "price-sideways" }));
    expect(badSort.status).toBe(400);

    const badPartType = await GET(getRequest({ partType: "SPACESHIP" }));
    expect(badPartType.status).toBe(400);
  });
});
