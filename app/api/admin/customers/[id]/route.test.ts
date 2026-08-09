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

const PREFIX = "test-customer-detail-11-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest() {
  return new NextRequest("http://localhost/api/admin/customers/x");
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let admin: { id: string };
let customer: { id: string };
let product: { id: string; sku: string };
let order: { id: string };

beforeAll(async () => {
  admin = await prisma.user.findUniqueOrThrow({
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
      phone: "09120000003",
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
      slug: `${PREFIX}-slug`,
      nameEn: "Detail test product",
      nameFa: "محصول آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: mobil1Brand.id,
      price: 1000,
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
      subtotal: 1000,
      discount: 0,
      shippingCost: 200_000,
      tax: 0,
      total: 201_000,
      shippingAddress: "1 Detail St.",
      postalCode: "1111111111",
      items: {
        create: [
          {
            productId: product.id,
            productNameSnapshot: product.sku,
            priceSnapshot: 1000,
            quantity: 1,
            lineTotal: 1000,
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

describe("GET /api/admin/customers/:id", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest(), ctx(customer.id));
    expect(res.status).toBe(401);

    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("returns 404 for an unknown customer", async () => {
    const res = await GET(getRequest(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-customer user (admin)", async () => {
    const res = await GET(getRequest(), ctx(admin.id));
    expect(res.status).toBe(404);
  });

  it("returns the profile with full order history", async () => {
    const res = await GET(getRequest(), ctx(customer.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.customer).toMatchObject({
      id: customer.id,
      firstName: "Detail",
      lastName: "Tester",
      email: `${PREFIX}@example.com`,
      phone: "09120000003",
      status: "ACTIVE",
    });

    const orderItem = json.data.customer.orders.find((o: { id: string }) => o.id === order.id);
    expect(orderItem).toMatchObject({
      customerName: "Detail Tester",
      itemCount: 1,
      status: "PENDING",
      paymentStatus: "UNPAID",
    });
    expect(typeof orderItem.total).toBe("number");
  });
});
