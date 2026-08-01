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

const PREFIX = "test-order-id-10-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest() {
  return new NextRequest("http://localhost/api/admin/orders/x");
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let customer: { id: string; firstName: string; lastName: string };
let product: { id: string };
let order: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  const engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  const mobil1Brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "mobil-1" } });

  customer = await prisma.user.create({
    data: {
      email: `${PREFIX}@example.com`,
      passwordHash: "unused",
      firstName: "Detail",
      lastName: "Tester",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });

  product = await prisma.product.create({
    data: {
      sku: `${PREFIX}-sku`,
      nameEn: "Detail test product",
      nameFa: "محصول آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: mobil1Brand.id,
      price: 2000,
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: "ACTIVE",
    },
  });

  order = await prisma.order.create({
    data: {
      customerId: customer.id,
      status: "PENDING",
      paymentStatus: "UNPAID",
      subtotal: 4000,
      discount: 0,
      shippingCost: 200_000,
      tax: 0,
      total: 204_000,
      shippingAddress: "42 Detail Ave.",
      postalCode: "1234567890",
      adminNote: "Initial note",
      items: {
        create: [
          {
            productId: product.id,
            productNameSnapshot: "Detail test product",
            priceSnapshot: 2000,
            quantity: 2,
            lineTotal: 4000,
          },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { order: { customerId: customer.id } } });
  await prisma.order.deleteMany({ where: { customerId: customer.id } });
  await prisma.user.delete({ where: { id: customer.id } });
  await prisma.product.delete({ where: { id: product.id } });
});

describe("GET /api/admin/orders/:id", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest(), ctx(order.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("returns 404 for an unknown order", async () => {
    const res = await GET(getRequest(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns full order detail", async () => {
    const res = await GET(getRequest(), ctx(order.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.order).toMatchObject({
      id: order.id,
      status: "PENDING",
      paymentStatus: "UNPAID",
      subtotal: 4000,
      discount: 0,
      shippingCost: 200_000,
      tax: 0,
      total: 204_000,
      shippingAddress: "42 Detail Ave.",
      postalCode: "1234567890",
      adminNote: "Initial note",
      customer: {
        id: customer.id,
        firstName: "Detail",
        lastName: "Tester",
        email: `${PREFIX}@example.com`,
      },
    });
    expect(json.data.order.items).toHaveLength(1);
    expect(json.data.order.items[0]).toMatchObject({
      productId: product.id,
      productName: "Detail test product",
      price: 2000,
      quantity: 2,
      lineTotal: 4000,
    });
  });
});
