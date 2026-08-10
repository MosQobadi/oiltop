import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getCookieName } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";
import { GET, POST } from "./route";

// Integration tests against a running database (`docker compose up -d db`).
// The route reads the session cookie on every request — guest checkout is the
// absence of one — so next/headers is mocked here even though most cases run
// with an empty jar.
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

const PREFIX = "test-sf-checkout";
const ADDRESS = `${PREFIX} — No. 5, Valiasr St., Tehran`;
const CUSTOMER_PHONE = "+989000000199";
// The history tests get their own customer rather than reusing the checkout
// one, whose order count depends on which POST cases ran first. `customer` then
// serves as the other account whose orders must not show up.
const HISTORY_PHONE = "+989000000198";
const ADMIN_PHONE = "+989000000197";

const HOUR = 60 * 60 * 1000;

// Checkout is rate-limited per IP (10/hour), and the limiter's in-memory
// buckets outlive a single test — so every request comes from its own address
// rather than the suite tripping its own limit halfway through.
let clientIp = 0;

function postRequest(body: unknown) {
  clientIp += 1;
  return new NextRequest("http://localhost/api/storefront/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `192.0.2.${clientIp}`,
    },
    body: JSON.stringify(body),
  });
}

function checkoutBody(items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    contactName: "Sara Ahmadi",
    contactPhone: "+989121234567",
    contactEmail: "sara@example.com",
    shippingAddress: ADDRESS,
    postalCode: "1234567890",
    deliveryMethod: "nationwide",
    ...overrides,
  };
}

const NATIONWIDE_COST = 190_000;

let holdProduct: { id: string; nameEn: string };
let expiredProduct: { id: string };
let snapshotProduct: { id: string; nameEn: string };
let scarceProduct: { id: string };
let inactiveProduct: { id: string };
let customer: { id: string };
let historyCustomer: { id: string };
let admin: { id: string };

async function signSessionToken(userId: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function stockOf(productId: string) {
  const inventory = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
  return inventory.stock;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      slug: `${PREFIX}-cat`,
      nameEn: "Checkout Test Category",
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
      nameEn: "Checkout Test Brand",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });

  async function createProduct(
    key: string,
    price: number,
    discountPercent: number,
    stock: number,
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) {
    return prisma.product.create({
      data: {
        sku: `${PREFIX}-${key}`,
        slug: `${PREFIX}-${key}`,
        nameEn: `Checkout Test ${key}`,
        nameFa: `محصول ${key}`,
        categoryId: category.id,
        brandId: brand.id,
        price,
        discountPercent,
        shortDescriptionEn: "Short",
        shortDescriptionFa: "کوتاه",
        longDescriptionEn: "Long",
        longDescriptionFa: "بلند",
        status,
        inventory: { create: { stock, lastUpdatedAt: new Date() } },
      },
    });
  }

  holdProduct = await createProduct("hold", 1_000_000, 0, 50);
  expiredProduct = await createProduct("expired", 1_000_000, 0, 50);
  snapshotProduct = await createProduct("snapshot", 500_000, 20, 50);
  scarceProduct = await createProduct("scarce", 100_000, 0, 2);
  inactiveProduct = await createProduct("inactive", 100_000, 0, 50, "INACTIVE");

  const now = Date.now();
  await prisma.productPriceLog.createMany({
    data: [
      // Three prices deep, so "the price in effect at addedAt" has to be the
      // *latest* row at or before that moment — 800,000 — rather than the
      // oldest one on file or the current one.
      { productId: holdProduct.id, price: 600_000, discountPercent: 0 },
      { productId: holdProduct.id, price: 800_000, discountPercent: 0 },
      { productId: holdProduct.id, price: 1_000_000, discountPercent: 0 },
      { productId: expiredProduct.id, price: 700_000, discountPercent: 0 },
    ],
  });
  // createMany can't set per-row changedAt values that differ, so they're
  // stamped afterwards — 30 days / 10 days / 3 hours ago for the hold product,
  // 60 hours ago for the expired one.
  const holdLogs = await prisma.productPriceLog.findMany({
    where: { productId: holdProduct.id },
    orderBy: { price: "asc" },
  });
  await Promise.all([
    prisma.productPriceLog.update({
      where: { id: holdLogs[0]!.id },
      data: { changedAt: new Date(now - 30 * 24 * HOUR) },
    }),
    prisma.productPriceLog.update({
      where: { id: holdLogs[1]!.id },
      data: { changedAt: new Date(now - 10 * 24 * HOUR) },
    }),
    prisma.productPriceLog.update({
      where: { id: holdLogs[2]!.id },
      data: { changedAt: new Date(now - 3 * HOUR) },
    }),
    prisma.productPriceLog.updateMany({
      where: { productId: expiredProduct.id },
      data: { changedAt: new Date(now - 60 * HOUR) },
    }),
  ]);

  async function createUser(phone: string, firstName: string, role: "CUSTOMER" | "ADMIN") {
    return prisma.user.create({
      data: {
        phone,
        passwordHash: "unused",
        firstName,
        lastName: "Customer",
        role,
        status: "ACTIVE",
      },
    });
  }

  customer = await createUser(CUSTOMER_PHONE, "Checkout", "CUSTOMER");
  historyCustomer = await createUser(HISTORY_PHONE, "History", "CUSTOMER");
  admin = await createUser(ADMIN_PHONE, "Staff", "ADMIN");
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { shippingAddress: { startsWith: PREFIX } } },
  });
  await prisma.order.deleteMany({ where: { shippingAddress: { startsWith: PREFIX } } });
  await prisma.productPriceLog.deleteMany({
    where: { product: { sku: { startsWith: PREFIX } } },
  });
  await prisma.inventory.deleteMany({ where: { product: { sku: { startsWith: PREFIX } } } });
  await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({
    where: { phone: { in: [CUSTOMER_PHONE, HISTORY_PHONE, ADMIN_PHONE] } },
  });
});

describe("POST /api/storefront/orders", () => {
  it("creates a guest order, snapshots the line, and decrements stock", async () => {
    const stockBefore = await stockOf(snapshotProduct.id);

    const res = await POST(
      postRequest(
        checkoutBody([
          { productId: snapshotProduct.id, quantity: 2, addedAt: new Date().toISOString() },
        ]),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // 500,000 list, 20% off = 400,000 a unit.
    expect(json.data.subtotal).toBe(1_000_000);
    expect(json.data.discount).toBe(200_000);
    expect(json.data.shippingCost).toBe(NATIONWIDE_COST);
    expect(json.data.tax).toBe(0);
    expect(json.data.total).toBe(1_000_000 - 200_000 + NATIONWIDE_COST);
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0]).toMatchObject({
      productId: snapshotProduct.id,
      quantity: 2,
      unitPrice: 400_000,
      lineTotal: 800_000,
      repriced: false,
      previousUnitPrice: null,
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: json.data.id },
      include: { items: true },
    });
    expect(order.customerId).toBeNull();
    expect(order.guestName).toBe("Sara Ahmadi");
    expect(order.guestPhone).toBe("+989121234567");
    expect(order.guestEmail).toBe("sara@example.com");
    expect(order.status).toBe("PENDING");
    expect(order.paymentStatus).toBe("UNPAID");
    expect(order.postalCode).toBe("1234567890");

    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.productNameSnapshot).toBe(snapshotProduct.nameEn);
    expect(Number(order.items[0]!.priceSnapshot)).toBe(400_000);
    expect(Number(order.items[0]!.lineTotal)).toBe(800_000);

    expect(await stockOf(snapshotProduct.id)).toBe(stockBefore - 2);
  });

  it("honors the price in effect when the line was added, within 24 hours", async () => {
    const addedAt = new Date(Date.now() - 5 * HOUR).toISOString();

    const res = await POST(
      postRequest(checkoutBody([{ productId: holdProduct.id, quantity: 1, addedAt }])),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    // Priced at what it cost 5 hours ago (800,000), not at the 1,000,000 it
    // was moved to 3 hours ago, and not at the 600,000 from 30 days back.
    expect(json.data.items[0]).toMatchObject({
      unitPrice: 800_000,
      lineTotal: 800_000,
      repriced: false,
      previousUnitPrice: null,
    });
    expect(json.data.subtotal).toBe(800_000);
    expect(json.data.discount).toBe(0);
    expect(json.data.total).toBe(800_000 + NATIONWIDE_COST);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: json.data.id },
      include: { items: true },
    });
    expect(Number(order.items[0]!.priceSnapshot)).toBe(800_000);
  });

  it("re-prices a line whose hold has expired and flags it", async () => {
    const addedAt = new Date(Date.now() - 48 * HOUR).toISOString();

    const res = await POST(
      postRequest(checkoutBody([{ productId: expiredProduct.id, quantity: 2, addedAt }])),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    // 700,000 when it went into the cart two days ago; the hold is spent, so
    // the current 1,000,000 applies and the line says so.
    expect(json.data.items[0]).toMatchObject({
      unitPrice: 1_000_000,
      lineTotal: 2_000_000,
      repriced: true,
      previousUnitPrice: 700_000,
    });
    expect(json.data.total).toBe(2_000_000 + NATIONWIDE_COST);
  });

  it("never charges more than the current price, even inside the hold window", async () => {
    // Added 5 hours ago at 800,000, but the product is cheaper now — the hold
    // protects against a rise, it doesn't override a cut.
    await prisma.product.update({
      where: { id: holdProduct.id },
      data: { price: 500_000 },
    });

    const res = await POST(
      postRequest(
        checkoutBody([
          {
            productId: holdProduct.id,
            quantity: 1,
            addedAt: new Date(Date.now() - 5 * HOUR).toISOString(),
          },
        ]),
      ),
    );
    const json = await res.json();

    await prisma.product.update({
      where: { id: holdProduct.id },
      data: { price: 1_000_000 },
    });

    expect(res.status).toBe(201);
    expect(json.data.items[0]).toMatchObject({
      unitPrice: 500_000,
      repriced: true,
      previousUnitPrice: 800_000,
    });
  });

  it("keeps the order's snapshot after the product is edited", async () => {
    const res = await POST(
      postRequest(
        checkoutBody([
          { productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() },
        ]),
      ),
    );
    const json = await res.json();
    expect(res.status).toBe(201);

    await prisma.product.update({
      where: { id: snapshotProduct.id },
      data: { nameEn: "Renamed After The Order", price: 9_000_000, discountPercent: 0 },
    });

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: json.data.id } });
    expect(item.productNameSnapshot).toBe(snapshotProduct.nameEn);
    expect(Number(item.priceSnapshot)).toBe(400_000);
    expect(Number(item.lineTotal)).toBe(400_000);

    await prisma.product.update({
      where: { id: snapshotProduct.id },
      data: { nameEn: snapshotProduct.nameEn, price: 500_000, discountPercent: 20 },
    });
  });

  it("ignores prices and totals submitted by the client", async () => {
    const res = await POST(
      postRequest(
        checkoutBody(
          [
            {
              productId: snapshotProduct.id,
              quantity: 1,
              addedAt: new Date().toISOString(),
              price: 1,
            },
          ],
          { subtotal: 1, discount: 999_999, shippingCost: 0, total: 1 },
        ),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.subtotal).toBe(500_000);
    expect(json.data.discount).toBe(100_000);
    expect(json.data.shippingCost).toBe(NATIONWIDE_COST);
    expect(json.data.total).toBe(400_000 + NATIONWIDE_COST);
  });

  it("charges the second delivery method's rate when it's chosen", async () => {
    const res = await POST(
      postRequest(
        checkoutBody(
          [{ productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() }],
          { deliveryMethod: "tehran-same-day" },
        ),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.shippingCost).toBe(380_000);
    expect(json.data.total).toBe(400_000 + 380_000);
  });

  it("rejects an order for more units than are in stock, changing nothing", async () => {
    const ordersBefore = await prisma.order.count({
      where: { shippingAddress: { startsWith: PREFIX } },
    });

    const res = await POST(
      postRequest(
        checkoutBody([
          { productId: scarceProduct.id, quantity: 3, addedAt: new Date().toISOString() },
        ]),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(await stockOf(scarceProduct.id)).toBe(2);
    expect(await prisma.order.count({ where: { shippingAddress: { startsWith: PREFIX } } })).toBe(
      ordersBefore,
    );
  });

  it("rejects the whole order when one line is short, leaving the others' stock alone", async () => {
    const snapshotStock = await stockOf(snapshotProduct.id);

    const res = await POST(
      postRequest(
        checkoutBody([
          { productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() },
          { productId: scarceProduct.id, quantity: 5, addedAt: new Date().toISOString() },
        ]),
      ),
    );

    expect(res.status).toBe(409);
    expect(await stockOf(snapshotProduct.id)).toBe(snapshotStock);
    expect(await stockOf(scarceProduct.id)).toBe(2);
  });

  it("rejects a product that is no longer purchasable", async () => {
    const res = await POST(
      postRequest(
        checkoutBody([
          { productId: inactiveProduct.id, quantity: 1, addedAt: new Date().toISOString() },
        ]),
      ),
    );

    expect(res.status).toBe(409);
    expect(await stockOf(inactiveProduct.id)).toBe(50);
  });

  it("attributes the order to the signed-in customer instead of storing guest contact", async () => {
    cookieJar.set(getCookieName(), await signSessionToken(customer.id));
    try {
      const res = await POST(
        postRequest(
          checkoutBody([
            { productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() },
          ]),
        ),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: json.data.id } });
      expect(order.customerId).toBe(customer.id);
      expect(order.guestName).toBeNull();
      expect(order.guestPhone).toBeNull();
      expect(order.guestEmail).toBeNull();
    } finally {
      cookieJar.clear();
    }
  });

  it("rejects a malformed payload", async () => {
    expect((await POST(postRequest(checkoutBody([])))).status).toBe(400);
    expect(
      (
        await POST(
          postRequest(
            checkoutBody(
              [{ productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() }],
              { postalCode: "12345" },
            ),
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest(
            checkoutBody(
              [{ productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() }],
              { deliveryMethod: "free-teleport" },
            ),
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest(
            checkoutBody([
              { productId: snapshotProduct.id, quantity: 0, addedAt: new Date().toISOString() },
            ]),
          ),
        )
      ).status,
    ).toBe(400);
    // The same product twice would decrement stock twice against one check.
    expect(
      (
        await POST(
          postRequest(
            checkoutBody([
              { productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() },
              { productId: snapshotProduct.id, quantity: 1, addedAt: new Date().toISOString() },
            ]),
          ),
        )
      ).status,
    ).toBe(400);
  });
});

describe("GET /api/storefront/orders", () => {
  // Three orders for the customer under test, one for a second customer and one
  // guest order — the last two are what "the customer's orders only" has to
  // exclude. Placed directly rather than through POST: checkout is already
  // covered above, and these need statuses a fresh order never has.
  let mine: string[];

  function getRequest(query = "") {
    return new NextRequest(`http://localhost/api/storefront/orders${query}`);
  }

  async function createOrder(
    customerId: string | null,
    overrides: {
      status?: "PENDING" | "SENDING" | "DELIVERED";
      paymentStatus?: "UNPAID" | "PAID";
      createdAt?: Date;
    } = {},
  ) {
    const order = await prisma.order.create({
      data: {
        customerId,
        guestName: customerId ? null : "Guest Shopper",
        guestPhone: customerId ? null : "+989121110000",
        status: overrides.status ?? "PENDING",
        paymentStatus: overrides.paymentStatus ?? "UNPAID",
        subtotal: 1_000_000,
        discount: 0,
        shippingCost: NATIONWIDE_COST,
        tax: 0,
        total: 1_000_000 + NATIONWIDE_COST,
        shippingAddress: ADDRESS,
        postalCode: "1234567890",
        adminNote: "Staff-only note",
        items: {
          create: [
            {
              productId: snapshotProduct.id,
              productNameSnapshot: "Name as it was",
              priceSnapshot: 400_000,
              quantity: 2,
              lineTotal: 800_000,
            },
            {
              productId: holdProduct.id,
              productNameSnapshot: "Second line",
              priceSnapshot: 200_000,
              quantity: 1,
              lineTotal: 200_000,
            },
          ],
        },
      },
    });
    if (overrides.createdAt) {
      await prisma.order.update({
        where: { id: order.id },
        data: { createdAt: overrides.createdAt },
      });
    }
    return order.id;
  }

  beforeAll(async () => {
    const day = 24 * HOUR;
    const now = Date.now();
    // Created oldest-first so insertion order can't be what makes the assertion
    // about "newest first" pass.
    const oldest = await createOrder(historyCustomer.id, { createdAt: new Date(now - 3 * day) });
    const middle = await createOrder(historyCustomer.id, {
      status: "SENDING",
      paymentStatus: "PAID",
      createdAt: new Date(now - 2 * day),
    });
    const newest = await createOrder(historyCustomer.id, {
      status: "DELIVERED",
      paymentStatus: "PAID",
      createdAt: new Date(now - day),
    });
    mine = [newest, middle, oldest];

    // Another customer's order and a guest order — neither may appear below.
    await createOrder(customer.id);
    await createOrder(null);
  });

  it("rejects a request with no session", async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  it("rejects an admin session — a staff login has no order history", async () => {
    cookieJar.set(getCookieName(), await signSessionToken(admin.id, "ADMIN"));
    try {
      expect((await GET(getRequest())).status).toBe(401);
    } finally {
      cookieJar.clear();
    }
  });

  it("returns only the signed-in customer's orders, newest first", async () => {
    cookieJar.set(getCookieName(), await signSessionToken(historyCustomer.id));
    try {
      const json = await (await GET(getRequest())).json();

      expect(json.success).toBe(true);
      expect(json.data.total).toBe(3);
      expect(json.data.orders.map((order: { id: string }) => order.id)).toEqual(mine);
    } finally {
      cookieJar.clear();
    }
  });

  it("reports fulfilment and payment status independently", async () => {
    cookieJar.set(getCookieName(), await signSessionToken(historyCustomer.id));
    try {
      const json = await (await GET(getRequest())).json();
      const [, sendingAndPaid] = json.data.orders;

      // The case the design brief calls out: on its way *and* already paid.
      expect(sendingAndPaid.status).toBe("SENDING");
      expect(sendingAndPaid.paymentStatus).toBe("PAID");
      expect(sendingAndPaid.itemCount).toBe(2);
      expect(sendingAndPaid.total).toBe(1_000_000 + NATIONWIDE_COST);
    } finally {
      cookieJar.clear();
    }
  });

  it("paginates", async () => {
    cookieJar.set(getCookieName(), await signSessionToken(historyCustomer.id));
    try {
      const json = await (await GET(getRequest("?page=2&pageSize=2"))).json();

      expect(json.data.total).toBe(3);
      expect(json.data.orders).toHaveLength(1);
      expect(json.data.orders[0].id).toBe(mine[2]);
    } finally {
      cookieJar.clear();
    }
  });

  it("rejects a malformed page param", async () => {
    cookieJar.set(getCookieName(), await signSessionToken(historyCustomer.id));
    try {
      expect((await GET(getRequest("?page=0"))).status).toBe(400);
      expect((await GET(getRequest("?pageSize=5000"))).status).toBe(400);
    } finally {
      cookieJar.clear();
    }
  });
});
