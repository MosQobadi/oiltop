import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getCookieName } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// Integration tests against a running database (`docker compose up -d db`).
// Every case here is about *whose* order it is, so the session cookie is the
// variable under test and next/headers is mocked to control it.
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

const PREFIX = "test-sf-order-detail";
const ADDRESS = `${PREFIX} — No. 12, Enghelab St., Tehran`;
const OWNER_PHONE = "+989000000189";
const STRANGER_PHONE = "+989000000188";
const ADMIN_PHONE = "+989000000187";

let product: { id: string };
let owner: { id: string };
let stranger: { id: string };
let admin: { id: string };
let ownOrderId: string;
let strangerOrderId: string;
let guestOrderId: string;

async function signSessionToken(userId: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(id: string) {
  return {
    request: new NextRequest(`http://localhost/api/storefront/orders/${id}`),
    context: { params: Promise.resolve({ id }) },
  };
}

async function get(id: string) {
  const { request, context } = getRequest(id);
  return GET(request, context);
}

async function asCustomer<T>(userId: string, run: () => Promise<T>, role?: "ADMIN"): Promise<T> {
  cookieJar.set(getCookieName(), await signSessionToken(userId, role ?? "CUSTOMER"));
  try {
    return await run();
  } finally {
    cookieJar.clear();
  }
}

beforeAll(async () => {
  // A *seeded* product rather than a fresh one: an order line only needs a
  // valid product FK here, and creating a throwaway brand/category would leave
  // rows for the admin suites that reach for `findFirstOrThrow()` to trip over
  // while this file's cleanup deletes them underneath. Every suite in this repo
  // prefixes its fixture SKUs with `test-`, so excluding those is what makes
  // this pick a row no other file running in parallel is about to delete.
  product = await prisma.product.findFirstOrThrow({
    where: { sku: { not: { startsWith: "test-" } } },
    select: { id: true },
  });

  async function createUser(phone: string, firstName: string, role: "CUSTOMER" | "ADMIN") {
    return prisma.user.create({
      data: {
        phone,
        passwordHash: "unused",
        firstName,
        lastName: "Tester",
        role,
        status: "ACTIVE",
      },
    });
  }

  owner = await createUser(OWNER_PHONE, "Owner", "CUSTOMER");
  stranger = await createUser(STRANGER_PHONE, "Stranger", "CUSTOMER");
  admin = await createUser(ADMIN_PHONE, "Staff", "ADMIN");

  async function createOrder(customerId: string | null) {
    const order = await prisma.order.create({
      data: {
        customerId,
        guestName: customerId ? null : "Guest Shopper",
        guestPhone: customerId ? null : "+989121110000",
        // Deliberately not PENDING/UNPAID: the pair the design brief calls out
        // is an order already on its way that has also been paid for.
        status: "SENDING",
        paymentStatus: "PAID",
        subtotal: 1_000_000,
        discount: 100_000,
        shippingCost: 190_000,
        tax: 0,
        total: 1_090_000,
        shippingAddress: ADDRESS,
        postalCode: "0123456789",
        adminNote: "Staff-only note about this customer",
        items: {
          create: [
            {
              productId: product.id,
              // Deliberately not the product's own name — the order stores what
              // it was called at the time, and must not follow the catalog.
              productNameSnapshot: "Name As Ordered",
              priceSnapshot: 450_000,
              quantity: 2,
              lineTotal: 900_000,
            },
          ],
        },
      },
    });
    return order.id;
  }

  ownOrderId = await createOrder(owner.id);
  strangerOrderId = await createOrder(stranger.id);
  guestOrderId = await createOrder(null);
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { shippingAddress: { startsWith: PREFIX } } },
  });
  await prisma.order.deleteMany({ where: { shippingAddress: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({
    where: { phone: { in: [OWNER_PHONE, STRANGER_PHONE, ADMIN_PHONE] } },
  });
});

describe("GET /api/storefront/orders/:id", () => {
  it("rejects a request with no session", async () => {
    const res = await get(ownOrderId);
    expect(res.status).toBe(401);
  });

  it("rejects an admin session", async () => {
    const res = await asCustomer(admin.id, () => get(ownOrderId), "ADMIN");
    expect(res.status).toBe(401);
  });

  it("returns the order to its owner, with the snapshot the order stored", async () => {
    const res = await asCustomer(owner.id, () => get(ownOrderId));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const { order } = json.data;
    expect(order.id).toBe(ownOrderId);
    // Both statuses, independently: sending *and* paid.
    expect(order.status).toBe("SENDING");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.shippingAddress).toBe(ADDRESS);
    expect(order.postalCode).toBe("0123456789");
    expect(order.subtotal).toBe(1_000_000);
    expect(order.discount).toBe(100_000);
    expect(order.shippingCost).toBe(190_000);
    expect(order.total).toBe(1_090_000);

    expect(order.items).toHaveLength(1);
    // The snapshot, not a join back to the product it points at.
    expect(order.items[0].productName).toBe("Name As Ordered");
    expect(order.items[0].price).toBe(450_000);
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].lineTotal).toBe(900_000);
  });

  it("never sends the admin note to the customer", async () => {
    const res = await asCustomer(owner.id, () => get(ownOrderId));
    const body = await res.text();

    expect(body).not.toContain("Staff-only note");
    expect(JSON.parse(body).data.order).not.toHaveProperty("adminNote");
  });

  it("answers 403 for another customer's order", async () => {
    const res = await asCustomer(owner.id, () => get(strangerOrderId));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
  });

  it("answers 403 for a guest order, which nobody owns", async () => {
    const res = await asCustomer(owner.id, () => get(guestOrderId));
    expect(res.status).toBe(403);
  });

  it("answers 404 for an id that is nothing", async () => {
    const res = await asCustomer(owner.id, () => get("cl00000000000000000000000"));
    expect(res.status).toBe(404);
  });
});
