import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { sendNotification } from "@/lib/notify";
import { PATCH } from "./route";

vi.mock("@/lib/notify", () => ({
  sendNotification: vi.fn(async () => {}),
}));

const sendNotificationMock = vi.mocked(sendNotification);

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
      slug: sku.toLowerCase(),
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

beforeEach(() => {
  sendNotificationMock.mockClear();
});

afterAll(async () => {
  await prisma.inventory.deleteMany({
    where: { product: { sku: { startsWith: SKU_PREFIX } } },
  });
  await prisma.stockNotification.deleteMany({
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

// Back-in-stock alerts (Design Decision 9).
describe("PATCH /api/admin/inventory/:productId — restock notifications", () => {
  it("notifies pending subscribers once when stock leaves zero", async () => {
    const product = await createTestProduct(`${SKU_PREFIX}-D`, 0);
    await prisma.stockNotification.createMany({
      data: [
        { productId: product.id, contact: "waiting@example.com" },
        { productId: product.id, contact: "+989121234567" },
      ],
    });

    const res = await PATCH(patchRequest({ addStock: 3 }), ctx(product.id));
    expect(res.status).toBe(200);

    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(
      sendNotificationMock.mock.calls.map(([message]) => message.to).sort(),
    ).toEqual(["+989121234567", "waiting@example.com"]);

    const rows = await prisma.stockNotification.findMany({
      where: { productId: product.id },
    });
    expect(rows.every((row) => row.notifiedAt !== null)).toBe(true);
  });

  it("doesn't notify the same subscriber on a later restock", async () => {
    const product = await createTestProduct(`${SKU_PREFIX}-E`, 0);
    await prisma.stockNotification.create({
      data: { productId: product.id, contact: "once@example.com" },
    });

    await PATCH(patchRequest({ addStock: 2 }), ctx(product.id));
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);

    // Sell out and restock again — the already-notified row stays quiet.
    await prisma.inventory.update({
      where: { productId: product.id },
      data: { stock: 0 },
    });
    sendNotificationMock.mockClear();

    await PATCH(patchRequest({ addStock: 2 }), ctx(product.id));
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("leaves subscribers alone when the product was already in stock", async () => {
    const product = await createTestProduct(`${SKU_PREFIX}-F`, 4);
    await prisma.stockNotification.create({
      data: { productId: product.id, contact: "stillwaiting@example.com" },
    });

    await PATCH(patchRequest({ addStock: 6 }), ctx(product.id));

    expect(sendNotificationMock).not.toHaveBeenCalled();
    const row = await prisma.stockNotification.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(row.notifiedAt).toBeNull();
  });

  it("only notifies subscribers of the restocked product", async () => {
    const restocked = await createTestProduct(`${SKU_PREFIX}-G`, 0);
    const other = await createTestProduct(`${SKU_PREFIX}-H`, 0);
    await prisma.stockNotification.createMany({
      data: [
        { productId: restocked.id, contact: "mine@example.com" },
        { productId: other.id, contact: "notmine@example.com" },
      ],
    });

    await PATCH(patchRequest({ addStock: 1 }), ctx(restocked.id));

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock.mock.calls[0][0].to).toBe("mine@example.com");
    const untouched = await prisma.stockNotification.findFirstOrThrow({
      where: { productId: other.id },
    });
    expect(untouched.notifiedAt).toBeNull();
  });
});
