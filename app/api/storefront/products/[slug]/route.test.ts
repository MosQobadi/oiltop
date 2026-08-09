import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).

const PREFIX = "test-sf-pdp";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function getRequest() {
  return new NextRequest("http://localhost/api/storefront/products/x");
}

let visibleSlug: string;
let inactiveSlug: string;
let hiddenCategorySlug: string;
let unfittedSlug: string;
let carEngineId: string;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      slug: `${PREFIX}-oil`,
      nameEn: "PDP Test Engine Oil",
      nameFa: "روغن آزمایشی",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "ENGINE_OIL",
      status: "ACTIVE",
    },
  });
  const inactiveCategory = await prisma.category.create({
    data: {
      slug: `${PREFIX}-hidden-cat`,
      nameEn: "PDP Test Hidden Category",
      nameFa: "دسته پنهان",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "OTHER",
      status: "INACTIVE",
    },
  });
  const brand = await prisma.brand.create({
    data: {
      slug: `${PREFIX}-brand`,
      nameEn: "PDP Test Brand",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });

  async function createProduct(
    key: string,
    overrides: { categoryId?: string; status?: "ACTIVE" | "INACTIVE" } = {},
  ) {
    return prisma.product.create({
      data: {
        sku: `${PREFIX}-${key}`,
        slug: `${PREFIX}-${key}`,
        nameEn: `PDP Test ${key}`,
        nameFa: `محصول ${key}`,
        categoryId: overrides.categoryId ?? category.id,
        brandId: brand.id,
        price: 1000,
        discountPercent: 25,
        tags: ["pdp", "test"],
        oemPartNumbers: [`${PREFIX}-OEM`],
        shortDescriptionEn: "Short",
        shortDescriptionFa: "کوتاه",
        longDescriptionEn: "Long",
        longDescriptionFa: "بلند",
        metaTitleEn: "Meta title",
        metaTitleFa: "عنوان متا",
        status: overrides.status ?? "ACTIVE",
        inventory: { create: { stock: 3, lastUpdatedAt: new Date() } },
      },
    });
  }

  const visible = await createProduct("visible");
  const inactive = await createProduct("inactive", { status: "INACTIVE" });
  const hiddenCategory = await createProduct("hidden-category", {
    categoryId: inactiveCategory.id,
  });
  const unfitted = await createProduct("unfitted");

  visibleSlug = visible.slug;
  inactiveSlug = inactive.slug;
  hiddenCategorySlug = hiddenCategory.slug;
  unfittedSlug = unfitted.slug;

  // A car engine that recommends the visible product, reached the same way the
  // fitment engine reaches it: engine -> CarEngineFitmentProfile -> profile ->
  // item -> product.
  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${PREFIX}-carbrand`,
      nameEn: "PDP Test Car Brand",
      nameFa: "برند خودرو",
      status: "ACTIVE",
    },
  });
  const carModel = await prisma.carModel.create({
    data: {
      carBrandId: carBrand.id,
      slug: `${PREFIX}-carmodel`,
      nameEn: "PDP Test Car Model",
      nameFa: "مدل خودرو",
      status: "ACTIVE",
    },
  });
  const carEngine = await prisma.carEngine.create({
    data: {
      carModelId: carModel.id,
      labelEn: "3.0si",
      labelFa: "۳.۰",
      yearStart: 2006,
      yearEnd: 2016,
      fuelType: "PETROL",
      displacementCc: 2996,
      engineCode: `${PREFIX}-ENG`,
      status: "ACTIVE",
    },
  });
  carEngineId = carEngine.id;

  const profile = await prisma.fitmentProfile.create({
    data: { label: `${PREFIX} profile` },
  });
  await prisma.fitmentProfileItem.create({
    data: {
      profileId: profile.id,
      categoryId: category.id,
      climate: "STANDARD",
      productId: visible.id,
    },
  });
  // A second profile pointing at the same product+engine: the engine must
  // still be listed once, not twice.
  const secondProfile = await prisma.fitmentProfile.create({
    data: { label: `${PREFIX} profile 2` },
  });
  await prisma.fitmentProfileItem.create({
    data: {
      profileId: secondProfile.id,
      categoryId: category.id,
      climate: "HOT",
      productId: visible.id,
    },
  });
  await prisma.carEngineFitmentProfile.createMany({
    data: [
      { carEngineId: carEngine.id, profileId: profile.id },
      { carEngineId: carEngine.id, profileId: secondProfile.id },
    ],
  });
});

afterAll(async () => {
  await prisma.carEngineFitmentProfile.deleteMany({
    where: { profile: { label: { startsWith: PREFIX } } },
  });
  await prisma.fitmentProfileItem.deleteMany({
    where: { profile: { label: { startsWith: PREFIX } } },
  });
  await prisma.fitmentProfile.deleteMany({
    where: { label: { startsWith: PREFIX } },
  });
  await prisma.carEngine.deleteMany({
    where: { engineCode: { startsWith: PREFIX } },
  });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: PREFIX } } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
});

describe("GET /api/storefront/products/:slug", () => {
  it("returns the full PDP payload, unauthenticated", async () => {
    const res = await GET(getRequest(), ctx(visibleSlug));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const product = json.data.product;
    expect(product.slug).toBe(visibleSlug);
    expect(product.longDescriptionEn).toBe("Long");
    expect(product.metaTitleEn).toBe("Meta title");
    expect(product.oemPartNumbers).toEqual([`${PREFIX}-OEM`]);
    expect(product.category.slug).toBe(`${PREFIX}-oil`);
    expect(product.category.partType).toBe("ENGINE_OIL");
    expect(product.brand.slug).toBe(`${PREFIX}-brand`);
  });

  it("computes finalPrice and a stock status without exposing the count", async () => {
    const res = await GET(getRequest(), ctx(visibleSlug));
    const json = await res.json();
    const product = json.data.product;

    expect(product.price).toBe(1000);
    expect(product.finalPrice).toBe(750);
    expect(product.stockStatus).toBe("LOW_STOCK");
    expect(product).not.toHaveProperty("stock");
    expect(product).not.toHaveProperty("inventory");
  });

  it("lists the car engines this product fits, deduplicated across profiles", async () => {
    const res = await GET(getRequest(), ctx(visibleSlug));
    const json = await res.json();

    expect(json.data.product.fitsCarEngines).toHaveLength(1);
    expect(json.data.product.fitsCarEngines[0]).toMatchObject({
      carEngineId,
      labelEn: "3.0si",
      yearStart: 2006,
      yearEnd: 2016,
      carModel: { slug: `${PREFIX}-carmodel`, nameEn: "PDP Test Car Model" },
      carBrand: { slug: `${PREFIX}-carbrand`, nameEn: "PDP Test Car Brand" },
    });
  });

  it("returns an empty fitment list for a product no profile references", async () => {
    const res = await GET(getRequest(), ctx(unfittedSlug));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.product.fitsCarEngines).toEqual([]);
  });

  it("404s an unknown slug", async () => {
    const res = await GET(getRequest(), ctx("no-such-product-slug"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("404s a malformed slug rather than reaching the database", async () => {
    const res = await GET(getRequest(), ctx("Not A Slug!"));
    expect(res.status).toBe(404);
  });

  it("404s an INACTIVE product and one behind an inactive category", async () => {
    expect((await GET(getRequest(), ctx(inactiveSlug))).status).toBe(404);
    expect((await GET(getRequest(), ctx(hiddenCategorySlug))).status).toBe(404);
  });
});
