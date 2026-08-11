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
      slug: `${SKU_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`.toLowerCase(),
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
  // After its items, which reference it.
  await prisma.order.deleteMany({
    where: { guestName: { startsWith: SKU_PREFIX } },
  });
  await prisma.fitmentProfileItem.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.productPriceLog.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.stockNotification.deleteMany({
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
    const res = await PATCH(requestWithBody("PATCH", { nameEn: "Updated Name" }), ctx(product.id));
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

  // An emptied spec box has to be able to undo a spec that was filled in by
  // mistake, which an omitted field can't say.
  it("clears a spec column when the update sends null", async () => {
    const product = await createTestProduct({ viscosity: "5W-30", volumeMl: 4000 });
    const res = await PATCH(requestWithBody("PATCH", { viscosity: null }), ctx(product.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.product.viscosity).toBeNull();
    // The spec it didn't mention is untouched.
    expect(json.data.product.volumeMl).toBe(4000);
  });

  it("rejects a duplicate SKU", async () => {
    const productA = await createTestProduct();
    const productB = await createTestProduct();

    const res = await PATCH(requestWithBody("PATCH", { sku: productA.sku }), ctx(productB.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });

  // Price history (Design Decision 8) — storefront checkout reads these rows to
  // honour a cart price captured in the last 24 hours, so a row must mean a
  // real price change and nothing else.
  it("logs a price change", async () => {
    const product = await createTestProduct({ price: 1000, discountPercent: 0 });

    const res = await PATCH(requestWithBody("PATCH", { price: 1200 }), ctx(product.id));
    expect(res.status).toBe(200);

    const logs = await prisma.productPriceLog.findMany({
      where: { productId: product.id },
    });
    expect(logs).toHaveLength(1);
    expect(Number(logs[0].price)).toBe(1200);
    expect(logs[0].discountPercent).toBe(0);
  });

  it("logs a discount change, carrying the unchanged price", async () => {
    const product = await createTestProduct({ price: 1000, discountPercent: 0 });

    const res = await PATCH(requestWithBody("PATCH", { discountPercent: 25 }), ctx(product.id));
    expect(res.status).toBe(200);

    const logs = await prisma.productPriceLog.findMany({
      where: { productId: product.id },
    });
    expect(logs).toHaveLength(1);
    expect(Number(logs[0].price)).toBe(1000);
    expect(logs[0].discountPercent).toBe(25);
  });

  it("writes nothing when the update doesn't touch price or discount", async () => {
    const product = await createTestProduct({ price: 1000, discountPercent: 10 });

    const res = await PATCH(
      requestWithBody("PATCH", { nameEn: "Renamed, same price" }),
      ctx(product.id),
    );
    expect(res.status).toBe(200);

    const count = await prisma.productPriceLog.count({
      where: { productId: product.id },
    });
    expect(count).toBe(0);
  });

  it("writes nothing when price and discount are resubmitted unchanged", async () => {
    const product = await createTestProduct({ price: 1000, discountPercent: 10 });

    const res = await PATCH(
      requestWithBody("PATCH", { price: 1000, discountPercent: 10 }),
      ctx(product.id),
    );
    expect(res.status).toBe(200);

    const count = await prisma.productPriceLog.count({
      where: { productId: product.id },
    });
    expect(count).toBe(0);
  });

  it("appends one row per real change", async () => {
    const product = await createTestProduct({ price: 1000, discountPercent: 0 });

    await PATCH(requestWithBody("PATCH", { price: 1100 }), ctx(product.id));
    await PATCH(requestWithBody("PATCH", { price: 1100 }), ctx(product.id));
    await PATCH(requestWithBody("PATCH", { price: 1100, discountPercent: 5 }), ctx(product.id));

    const logs = await prisma.productPriceLog.findMany({
      where: { productId: product.id },
      orderBy: { changedAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.discountPercent)).toEqual([0, 5]);
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

  it("takes price history and back-in-stock signups down with the product", async () => {
    const product = await createTestProduct();
    await prisma.productPriceLog.create({
      data: { productId: product.id, price: 900, discountPercent: 0 },
    });
    await prisma.stockNotification.create({
      data: { productId: product.id, contact: "waiting@example.com" },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(product.id));
    expect(res.status).toBe(200);

    expect(await prisma.productPriceLog.count({ where: { productId: product.id } })).toBe(0);
    expect(await prisma.stockNotification.count({ where: { productId: product.id } })).toBe(0);
  });

  it("deactivates instead of deleting when the product has order history", async () => {
    const product = await createTestProduct();
    // Its own order, not an arbitrary existing one: the storefront checkout
    // suites create orders and delete them in their own cleanup, and they run in
    // parallel with this file against the shared database — so a row picked by
    // an unfiltered `findFirstOrThrow()` can be deleted underneath this test.
    // A guest order (no customerId) keeps the fixture to a single row.
    const order = await prisma.order.create({
      data: {
        guestName: `${SKU_PREFIX} Guest`,
        guestPhone: "02112345678",
        status: "PENDING",
        paymentStatus: "UNPAID",
        subtotal: 1000,
        discount: 0,
        shippingCost: 0,
        tax: 0,
        total: 1000,
        shippingAddress: "Tehran, Tehran, Somewhere",
        postalCode: "1234567890",
      },
    });
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
