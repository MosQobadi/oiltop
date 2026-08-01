import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
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

const PREFIX = "test-customer-11-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/customers");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

let engineOilCategory: { id: string };
let mobil1Brand: { id: string };
let product: { id: string; sku: string; price: unknown };

let customerAlpha: { id: string };
let customerBeta: { id: string };

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
      nameEn: "Test customer product",
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

  customerAlpha = await prisma.user.create({
    data: {
      email: `${PREFIX}-alpha@example.com`,
      phone: "09120000001",
      passwordHash: "unused",
      firstName: "Alpha",
      lastName: "Tester",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });
  customerBeta = await prisma.user.create({
    data: {
      email: `${PREFIX}-beta@example.com`,
      phone: "09120000002",
      passwordHash: "unused",
      firstName: "Beta",
      lastName: "Tester",
      role: "CUSTOMER",
      status: "INACTIVE",
    },
  });

  await prisma.order.create({
    data: {
      customerId: customerAlpha.id,
      status: "PENDING",
      paymentStatus: "UNPAID",
      subtotal: 1000,
      discount: 0,
      shippingCost: 200_000,
      tax: 0,
      total: 201_000,
      shippingAddress: "1 Test St.",
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
  await prisma.orderItem.deleteMany({
    where: { order: { customer: { email: { startsWith: PREFIX } } } },
  });
  await prisma.order.deleteMany({ where: { customer: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.product.deleteMany({ where: { sku: `${PREFIX}-sku` } });
});

describe("GET /api/admin/customers", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("lists customers with name, email, phone, status, and order count", async () => {
    const res = await GET(getRequest({ search: "Alpha" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const item = json.data.items.find((i: { id: string }) => i.id === customerAlpha.id);
    expect(item).toMatchObject({
      firstName: "Alpha",
      lastName: "Tester",
      email: `${PREFIX}-alpha@example.com`,
      phone: "09120000001",
      status: "ACTIVE",
      orderCount: 1,
    });
  });

  it("excludes admin users", async () => {
    const res = await GET(getRequest({ search: "admin@topoil.com" }));
    const json = await res.json();

    expect(json.data.items.length).toBe(0);
  });

  it("filters by status", async () => {
    const res = await GET(getRequest({ search: PREFIX, status: "INACTIVE", pageSize: "100" }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === customerBeta.id)).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === customerAlpha.id)).toBe(false);
  });

  it("searches by phone", async () => {
    const res = await GET(getRequest({ search: "09120000002" }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === customerBeta.id)).toBe(true);
  });
});
