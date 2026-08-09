import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH } from "./route";

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

const PREFIX = "test-order-status-10-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function patchRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/orders/x/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let customer: { id: string };
let product: { id: string };

async function createOrder(status: "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "CANCELLED") {
  return prisma.order.create({
    data: {
      customerId: customer.id,
      status,
      paymentStatus: "UNPAID",
      subtotal: 1000,
      discount: 0,
      shippingCost: 200_000,
      tax: 0,
      total: 201_000,
      shippingAddress: "1 Status St.",
      postalCode: "1111111111",
      items: {
        create: [
          {
            productId: product.id,
            productNameSnapshot: "Status test product",
            priceSnapshot: 1000,
            quantity: 1,
            lineTotal: 1000,
          },
        ],
      },
    },
  });
}

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
      firstName: "Status",
      lastName: "Tester",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });

  product = await prisma.product.create({
    data: {
      sku: `${PREFIX}-sku`,
      slug: `${PREFIX}-slug`,
      nameEn: "Status test product",
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
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { order: { customerId: customer.id } } });
  await prisma.order.deleteMany({ where: { customerId: customer.id } });
  await prisma.user.delete({ where: { id: customer.id } });
  await prisma.product.delete({ where: { id: product.id } });
});

describe("PATCH /api/admin/orders/:id/status", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await PATCH(patchRequest({ status: "SENDING" }), ctx("does-not-exist"));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("returns 404 for an unknown order", async () => {
    const res = await PATCH(patchRequest({ status: "SENDING" }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("rejects an invalid status value", async () => {
    const order = await createOrder("PENDING");
    const res = await PATCH(patchRequest({ status: "SHIPPED" }), ctx(order.id));
    expect(res.status).toBe(400);
  });

  it("accepts the valid PENDING -> SENDING transition", async () => {
    const order = await createOrder("PENDING");
    const res = await PATCH(patchRequest({ status: "SENDING" }), ctx(order.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.order.status).toBe("SENDING");
  });

  it("rejects a skipped-step transition (PENDING -> SENT)", async () => {
    const order = await createOrder("PENDING");
    const res = await PATCH(patchRequest({ status: "SENT" }), ctx(order.id));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/PENDING/);
  });

  it("accepts CANCELLED from PENDING", async () => {
    const order = await createOrder("PENDING");
    const res = await PATCH(patchRequest({ status: "CANCELLED" }), ctx(order.id));
    expect(res.status).toBe(200);
  });

  it("accepts CANCELLED from SENDING", async () => {
    const order = await createOrder("SENDING");
    const res = await PATCH(patchRequest({ status: "CANCELLED" }), ctx(order.id));
    expect(res.status).toBe(200);
  });

  it("rejects CANCELLED from an invalid state (SENT)", async () => {
    const order = await createOrder("SENT");
    const res = await PATCH(patchRequest({ status: "CANCELLED" }), ctx(order.id));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("rejects any transition out of a terminal state (DELIVERED)", async () => {
    const order = await createOrder("DELIVERED");
    const res = await PATCH(patchRequest({ status: "SENDING" }), ctx(order.id));
    expect(res.status).toBe(400);
  });

  it("progresses the full sequence SENDING -> SENT -> DELIVERED", async () => {
    const order = await createOrder("SENDING");

    const toSent = await PATCH(patchRequest({ status: "SENT" }), ctx(order.id));
    expect(toSent.status).toBe(200);

    const toDelivered = await PATCH(patchRequest({ status: "DELIVERED" }), ctx(order.id));
    const json = await toDelivered.json();
    expect(toDelivered.status).toBe(200);
    expect(json.data.order.status).toBe("DELIVERED");
  });
});
