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

const PREFIX = "test-order-10-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/orders");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

let engineOilCategory: { id: string };
let mobil1Brand: { id: string };
let product: { id: string; sku: string; price: unknown };

let customerAlpha: { id: string };
let customerBeta: { id: string };

let orderAlpha: { id: string };
let orderBeta: { id: string };
let orderGuest: { id: string };

async function createCustomer(email: string, firstName: string, lastName: string) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: "unused",
      firstName,
      lastName,
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });
}

async function createOrder(opts: {
  customerId: string | null;
  guestName?: string;
  guestEmail?: string;
  status: "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "CANCELLED";
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  createdAt: Date;
}) {
  const priceSnapshot = Number(product.price);
  return prisma.order.create({
    data: {
      customerId: opts.customerId,
      guestName: opts.guestName ?? null,
      guestEmail: opts.guestEmail ?? null,
      status: opts.status,
      paymentStatus: opts.paymentStatus,
      subtotal: priceSnapshot,
      discount: 0,
      shippingCost: 200_000,
      tax: 0,
      total: priceSnapshot + 200_000,
      shippingAddress: "1 Test St.",
      postalCode: "1111111111",
      createdAt: opts.createdAt,
      items: {
        create: [
          {
            productId: product.id,
            productNameSnapshot: product.sku,
            priceSnapshot,
            quantity: 1,
            lineTotal: priceSnapshot,
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

  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  mobil1Brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "mobil-1" } });

  product = await prisma.product.create({
    data: {
      sku: `${PREFIX}-sku`,
      slug: `${PREFIX}-slug`,
      nameEn: "Test order product",
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

  customerAlpha = await createCustomer(`${PREFIX}-alpha@example.com`, "Alpha", "Tester");
  customerBeta = await createCustomer(`${PREFIX}-beta@example.com`, "Beta", "Tester");

  orderAlpha = await createOrder({
    customerId: customerAlpha.id,
    status: "PENDING",
    paymentStatus: "UNPAID",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  orderBeta = await createOrder({
    customerId: customerBeta.id,
    status: "DELIVERED",
    paymentStatus: "PAID",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  });
  orderGuest = await createOrder({
    customerId: null,
    guestName: "Gamma Guest",
    guestEmail: `${PREFIX}-gamma@example.com`,
    status: "SENT",
    paymentStatus: "PAID",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  });
});

afterAll(async () => {
  const orderIds = [orderAlpha.id, orderBeta.id, orderGuest.id];
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.product.deleteMany({ where: { sku: `${PREFIX}-sku` } });
});

describe("GET /api/admin/orders", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("lists orders with customer name, item count, total, status, paymentStatus, date", async () => {
    const res = await GET(getRequest({ search: "Alpha" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const item = json.data.items.find((i: { id: string }) => i.id === orderAlpha.id);
    expect(item).toMatchObject({
      customerName: "Alpha Tester",
      isGuest: false,
      itemCount: 1,
      status: "PENDING",
      paymentStatus: "UNPAID",
    });
    expect(typeof item.total).toBe("number");
    expect(item.date).toBeTruthy();
  });

  it("filters by status", async () => {
    const res = await GET(getRequest({ search: PREFIX, status: "DELIVERED", pageSize: "100" }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === orderBeta.id)).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === orderAlpha.id)).toBe(false);
  });

  it("filters by payment status", async () => {
    const res = await GET(getRequest({ search: PREFIX, payment: "PAID", pageSize: "100" }));
    const json = await res.json();

    expect(
      json.data.items.every((i: { paymentStatus: string }) => i.paymentStatus === "PAID"),
    ).toBe(true);
  });

  it("filters by date range", async () => {
    const res = await GET(
      getRequest({
        search: PREFIX,
        dateFrom: "2026-01-15",
        dateTo: "2026-02-15",
        pageSize: "100",
      }),
    );
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === orderBeta.id)).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === orderAlpha.id)).toBe(false);
  });

  it("searches by customer name", async () => {
    const res = await GET(getRequest({ search: "Beta" }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === orderBeta.id)).toBe(true);
  });

  it("matches a full name spanning firstName and lastName", async () => {
    const res = await GET(getRequest({ search: "Alpha Tester" }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === orderAlpha.id)).toBe(true);
    // Every token has to match, so the other customer's order is excluded even
    // though it shares the "Tester" surname.
    expect(json.data.items.some((i: { id: string }) => i.id === orderBeta.id)).toBe(false);
  });

  it("lists a guest order under its own name and flags it", async () => {
    const res = await GET(getRequest({ search: "Gamma Guest" }));
    const json = await res.json();

    const item = json.data.items.find((i: { id: string }) => i.id === orderGuest.id);
    expect(item).toMatchObject({ customerName: "Gamma Guest", isGuest: true });
  });

  it("searches a guest order by its email", async () => {
    const res = await GET(getRequest({ search: `${PREFIX}-gamma@` }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === orderGuest.id)).toBe(true);
  });
});
