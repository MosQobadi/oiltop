import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_CART_QUANTITY } from "@/lib/storefront/cart";
import { GET } from "./route";

// Fixtures rather than seeded rows, same reasoning as the PLP route test: the
// assertions below turn on exact stock levels, which drift in a dev database as
// soon as the admin Inventory screen is used. Run against a seeded database
// (`pnpm prisma:seed`).

const PREFIX = "test-sf-cart";

interface CartProductResponse {
  productId: string;
  slug: string;
  finalPrice: number;
  stockStatus: string | null;
  maxQuantity: number;
}

function getRequest(ids: string) {
  const url = new URL("http://localhost/api/storefront/cart");
  url.searchParams.set("ids", ids);
  return new NextRequest(url);
}

async function lookup(ids: string[]) {
  const res = await GET(getRequest(ids.join(",")));
  const json = await res.json();
  expect(res.status).toBe(200);
  return new Map<string, CartProductResponse>(
    (json.data.products as CartProductResponse[]).map((product) => [product.productId, product]),
  );
}

const ids: Record<string, string> = {};

interface ProductFixture {
  key: string;
  categoryId: string;
  brandId: string;
  price: number;
  discountPercent: number;
  stock: number;
  status: "ACTIVE" | "INACTIVE";
}

async function createProduct(fixture: ProductFixture) {
  const product = await prisma.product.create({
    data: {
      sku: `${PREFIX}-${fixture.key}`,
      slug: `${PREFIX}-${fixture.key}`,
      nameEn: `Cart Test ${fixture.key}`,
      nameFa: `سبد ${fixture.key}`,
      categoryId: fixture.categoryId,
      brandId: fixture.brandId,
      price: fixture.price,
      discountPercent: fixture.discountPercent,
      oemPartNumbers: [],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: fixture.status,
      inventory: { create: { stock: fixture.stock, lastUpdatedAt: new Date() } },
    },
  });
  ids[fixture.key] = product.id;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      slug: `${PREFIX}-oil`,
      nameEn: "Cart Test Engine Oil",
      nameFa: "روغن سبد",
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
      slug: `${PREFIX}-inactive-cat`,
      nameEn: "Cart Test Inactive Category",
      nameFa: "دسته غیرفعال سبد",
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
      nameEn: "Cart Test Brand",
      nameFa: "برند سبد",
      status: "ACTIVE",
    },
  });

  await createProduct({
    key: "plenty",
    categoryId: category.id,
    brandId: brand.id,
    price: 1000,
    discountPercent: 20,
    stock: 400,
    status: "ACTIVE",
  });
  await createProduct({
    key: "low",
    categoryId: category.id,
    brandId: brand.id,
    price: 500,
    discountPercent: 0,
    stock: 3,
    status: "ACTIVE",
  });
  await createProduct({
    key: "out",
    categoryId: category.id,
    brandId: brand.id,
    price: 800,
    discountPercent: 0,
    stock: 0,
    status: "ACTIVE",
  });
  // The two below stand for a cart line that was added before the product was
  // pulled from sale — neither may come back.
  await createProduct({
    key: "deactivated",
    categoryId: category.id,
    brandId: brand.id,
    price: 900,
    discountPercent: 0,
    stock: 10,
    status: "INACTIVE",
  });
  await createProduct({
    key: "inactive-category",
    categoryId: inactiveCategory.id,
    brandId: brand.id,
    price: 900,
    discountPercent: 0,
    stock: 10,
    status: "ACTIVE",
  });
});

afterAll(async () => {
  await prisma.inventory.deleteMany({ where: { product: { sku: { startsWith: PREFIX } } } });
  await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
});

describe("GET /api/storefront/cart", () => {
  it("returns the current price and stock status for every id it's given", async () => {
    const products = await lookup([ids.plenty!, ids.low!, ids.out!]);

    expect(products.size).toBe(3);
    expect(products.get(ids.plenty!)).toMatchObject({
      slug: `${PREFIX}-plenty`,
      finalPrice: 800,
      stockStatus: null,
    });
    expect(products.get(ids.low!)!.stockStatus).toBe("LOW_STOCK");
    expect(products.get(ids.out!)!.stockStatus).toBe("OUT_OF_STOCK");
  });

  it("caps maxQuantity at the per-line ceiling, and reports what's left below it", async () => {
    const products = await lookup([ids.plenty!, ids.low!, ids.out!]);

    // 400 in stock is published as the ceiling, not as 400.
    expect(products.get(ids.plenty!)!.maxQuantity).toBe(MAX_CART_QUANTITY);
    expect(products.get(ids.low!)!.maxQuantity).toBe(3);
    expect(products.get(ids.out!)!.maxQuantity).toBe(0);
  });

  it("omits a product that is no longer purchasable rather than erroring", async () => {
    const products = await lookup([
      ids.plenty!,
      ids.deactivated!,
      ids["inactive-category"]!,
      "prod_does_not_exist",
    ]);

    expect([...products.keys()]).toEqual([ids.plenty!]);
  });

  it("never exposes a raw stock count or the inventory relation", async () => {
    const res = await GET(getRequest([ids.plenty!, ids.low!].join(",")));
    const json = await res.json();

    for (const product of json.data.products) {
      expect(product).not.toHaveProperty("stock");
      expect(product).not.toHaveProperty("inventory");
    }
  });

  it("tolerates a repeated id", async () => {
    const products = await lookup([ids.low!, ids.low!]);

    expect(products.size).toBe(1);
  });

  it("rejects an empty or oversized id list with a 400", async () => {
    expect((await GET(getRequest(""))).status).toBe(400);
    expect((await GET(getRequest(" , , "))).status).toBe(400);

    const tooMany = Array.from({ length: 51 }, (_, index) => `prod_${index}`);
    expect((await GET(getRequest(tooMany.join(",")))).status).toBe(400);
  });
});
