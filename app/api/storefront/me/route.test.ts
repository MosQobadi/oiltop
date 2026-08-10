import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCookieName } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { PATCH } from "./route";

// Integration tests against a running database (`docker compose up -d db`). The
// route reads the session cookie on every request, so next/headers is mocked to
// give `cookies()` the request-scoped storage a direct handler call has none of.
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

const PREFIX = "test-sf-profile";
const CUSTOMER_PHONE = "09120002211";
// The account whose identifiers are already taken — what makes the two 409
// cases mean something.
const OTHER_PHONE = "09120002212";
const OTHER_EMAIL = `${PREFIX}-other@example.com`;
const ADMIN_EMAIL = `${PREFIX}-admin@example.com`;

let customer: { id: string };
let other: { id: string };
let admin: { id: string };

async function signSessionToken(userId: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function signIn(userId: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  cookieJar.set(getCookieName(), await signSessionToken(userId, role));
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/storefront/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: PREFIX,
    lastName: "Customer",
    phone: CUSTOMER_PHONE,
    email: "",
    ...overrides,
  };
}

beforeEach(async () => {
  cookieJar.clear();
  await prisma.user.deleteMany({ where: { firstName: { startsWith: PREFIX } } });

  const passwordHash = await hashPassword("Customer123!");
  customer = await prisma.user.create({
    data: {
      firstName: PREFIX,
      lastName: "Customer",
      phone: CUSTOMER_PHONE,
      passwordHash,
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });
  other = await prisma.user.create({
    data: {
      firstName: `${PREFIX}-other`,
      lastName: "Customer",
      phone: OTHER_PHONE,
      email: OTHER_EMAIL,
      passwordHash,
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });
  admin = await prisma.user.create({
    data: {
      firstName: `${PREFIX}-admin`,
      lastName: "Staff",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { firstName: { startsWith: PREFIX } } });
});

describe("PATCH /api/storefront/me", () => {
  it("updates the signed-in customer's name, phone and email", async () => {
    await signIn(customer.id);

    const res = await PATCH(
      patchRequest(
        validBody({
          firstName: `${PREFIX}-renamed`,
          lastName: "Ahmadi",
          phone: "0912 000 3311",
          email: `${PREFIX}@example.com`,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user).not.toHaveProperty("passwordHash");
    // The profile echoes the row rather than the body, so the form re-seeds
    // itself with the normalized number instead of the spacing just typed.
    expect(json.data.profile).toEqual({
      firstName: `${PREFIX}-renamed`,
      lastName: "Ahmadi",
      phone: "09120003311",
      email: `${PREFIX}@example.com`,
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.firstName).toBe(`${PREFIX}-renamed`);
    expect(row.lastName).toBe("Ahmadi");
    expect(row.email).toBe(`${PREFIX}@example.com`);
    // Stored normalized, so the spacing typed here doesn't stop them signing in
    // with a differently spaced number next time.
    expect(row.phone).toBe("09120003311");
  });

  it("saves an unchanged form rather than reporting the customer's own number as taken", async () => {
    await signIn(customer.id);

    const res = await PATCH(patchRequest(validBody()));

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).phone).toBe(
      CUSTOMER_PHONE,
    );
  });

  it("treats a blank email as an instruction to clear it", async () => {
    await signIn(customer.id);
    await prisma.user.update({
      where: { id: customer.id },
      data: { email: `${PREFIX}-clearme@example.com` },
    });

    const res = await PATCH(patchRequest(validBody({ email: "  " })));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.user.email).toBeNull();
    expect(json.data.profile.email).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).email).toBeNull();
  });

  it("returns 409 when another account already holds the phone number", async () => {
    await signIn(customer.id);

    const res = await PATCH(patchRequest(validBody({ phone: "0912-000-2212" })));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/phone/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).phone).toBe(
      CUSTOMER_PHONE,
    );
  });

  it("returns 409 when another account already holds the email address", async () => {
    await signIn(customer.id);

    const res = await PATCH(patchRequest(validBody({ email: OTHER_EMAIL })));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/email/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).id).toBe(other.id);
  });

  it("never lets the body decide whose profile is edited", async () => {
    await signIn(customer.id);

    const res = await PATCH(
      patchRequest(validBody({ id: other.id, role: "ADMIN", status: "INACTIVE" })),
    );

    expect(res.status).toBe(200);
    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(untouched.firstName).toBe(`${PREFIX}-other`);
    const self = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(self.role).toBe("CUSTOMER");
    expect(self.status).toBe("ACTIVE");
  });

  it("returns 401 without a session", async () => {
    const res = await PATCH(patchRequest(validBody()));

    expect(res.status).toBe(401);
  });

  it("returns 401 for an admin session — staff have no storefront profile", async () => {
    await signIn(admin.id, "ADMIN");

    const res = await PATCH(patchRequest(validBody()));

    expect(res.status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).email).toBe(
      ADMIN_EMAIL,
    );
  });

  it("returns 401 once the account behind a valid token is gone", async () => {
    await signIn(customer.id);
    await prisma.user.delete({ where: { id: customer.id } });

    expect((await PATCH(patchRequest(validBody()))).status).toBe(401);
  });

  it("returns 400 for a blank name, a junk phone, a malformed email and a missing phone", async () => {
    await signIn(customer.id);

    expect((await PATCH(patchRequest(validBody({ firstName: "  " })))).status).toBe(400);
    expect((await PATCH(patchRequest(validBody({ phone: "abc" })))).status).toBe(400);
    expect((await PATCH(patchRequest(validBody({ email: "not-an-email" })))).status).toBe(400);
    expect((await PATCH(patchRequest(validBody({ phone: "" })))).status).toBe(400);
  });

  it("returns 400 for a malformed JSON body", async () => {
    await signIn(customer.id);

    const res = await PATCH(
      new NextRequest("http://localhost/api/storefront/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{ not json",
      }),
    );

    expect(res.status).toBe(400);
  });
});
