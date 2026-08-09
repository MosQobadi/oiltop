import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).

const PREFIX = "test-sf-notify";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/storefront/products/x/notify-me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let outOfStockId: string;
let outOfStockSlug: string;
let inStockSlug: string;
let inactiveSlug: string;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      slug: `${PREFIX}-cat`,
      nameEn: "Notify Test Category",
      nameFa: "دسته آزمایشی",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "ENGINE_OIL",
      status: "ACTIVE",
    },
  });
  const brand = await prisma.brand.create({
    data: {
      slug: `${PREFIX}-brand`,
      nameEn: "Notify Test Brand",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });

  async function createProduct(
    key: string,
    stock: number,
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) {
    return prisma.product.create({
      data: {
        sku: `${PREFIX}-${key}`,
        slug: `${PREFIX}-${key}`,
        nameEn: `Notify Test ${key}`,
        nameFa: `محصول ${key}`,
        categoryId: category.id,
        brandId: brand.id,
        price: 1000,
        discountPercent: 0,
        shortDescriptionEn: "Short",
        shortDescriptionFa: "کوتاه",
        longDescriptionEn: "Long",
        longDescriptionFa: "بلند",
        status,
        inventory: { create: { stock, lastUpdatedAt: new Date() } },
      },
    });
  }

  const outOfStock = await createProduct("out-of-stock", 0);
  const inStock = await createProduct("in-stock", 25);
  const inactive = await createProduct("inactive", 0, "INACTIVE");

  outOfStockId = outOfStock.id;
  outOfStockSlug = outOfStock.slug;
  inStockSlug = inStock.slug;
  inactiveSlug = inactive.slug;
});

afterAll(async () => {
  await prisma.stockNotification.deleteMany({
    where: { product: { sku: { startsWith: PREFIX } } },
  });
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: PREFIX } } },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
});

describe("POST /api/storefront/products/:slug/notify-me", () => {
  it("creates a StockNotification for an out-of-stock product, unauthenticated", async () => {
    const res = await POST(postRequest({ contact: "customer@example.com" }), ctx(outOfStockSlug));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.alreadyInStock).toBe(false);

    const row = await prisma.stockNotification.findUniqueOrThrow({
      where: { id: json.data.notification.id },
    });
    expect(row.productId).toBe(outOfStockId);
    expect(row.contact).toBe("customer@example.com");
    expect(row.notifiedAt).toBeNull();
  });

  it("accepts a phone number as the contact", async () => {
    const res = await POST(postRequest({ contact: "+98 912 345 6789" }), ctx(outOfStockSlug));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.notification.contact).toBe("+98 912 345 6789");
  });

  it("resolves the segment as a product id as well as a slug", async () => {
    const res = await POST(postRequest({ contact: "by-id@example.com" }), ctx(outOfStockId));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.notification.productId).toBe(outOfStockId);
  });

  it("reuses the pending row instead of stacking duplicates", async () => {
    const first = await POST(postRequest({ contact: "repeat@example.com" }), ctx(outOfStockSlug));
    const firstJson = await first.json();

    const second = await POST(postRequest({ contact: "repeat@example.com" }), ctx(outOfStockSlug));
    const secondJson = await second.json();

    expect(secondJson.data.notification.id).toBe(firstJson.data.notification.id);
    expect(
      await prisma.stockNotification.count({
        where: { productId: outOfStockId, contact: "repeat@example.com" },
      }),
    ).toBe(1);
  });

  it("accepts a signup for an in-stock product and says so", async () => {
    const res = await POST(postRequest({ contact: "eager@example.com" }), ctx(inStockSlug));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.alreadyInStock).toBe(true);
  });

  it("rejects a missing or malformed contact", async () => {
    expect((await POST(postRequest({}), ctx(outOfStockSlug))).status).toBe(400);
    expect((await POST(postRequest({ contact: "   " }), ctx(outOfStockSlug))).status).toBe(400);
    expect(
      (await POST(postRequest({ contact: "not a contact" }), ctx(outOfStockSlug))).status,
    ).toBe(400);
  });

  it("404s an unknown product and an INACTIVE one", async () => {
    expect((await POST(postRequest({ contact: "a@b.com" }), ctx("no-such-product"))).status).toBe(
      404,
    );
    expect((await POST(postRequest({ contact: "a@b.com" }), ctx(inactiveSlug))).status).toBe(404);
  });
});
