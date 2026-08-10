import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { POST } from "./route";

// Same fake cookie jar as the login route's test: cookies() needs Next's
// request-scoped storage, which a direct handler call doesn't have.
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

const PREFIX = "test-register-route";

// The limiter is process-wide module state, so each case registers from its
// own address rather than the sixth test tripping the fifth one's budget.
let requestCount = 0;

function registerRequest(body: unknown, ip?: string) {
  requestCount += 1;
  return new NextRequest("http://localhost/api/storefront/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip ?? `10.1.0.${requestCount}`,
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: PREFIX,
    lastName: "Newcomer",
    phone: "0912 000 1122",
    password: "Customer123!",
    ...overrides,
  };
}

beforeEach(() => {
  cookieJar.clear();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { firstName: PREFIX } });
});

describe("POST /api/storefront/auth/register", () => {
  it("creates an ACTIVE CUSTOMER, signs them in, and never returns the hash", async () => {
    const res = await POST(registerRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.user.role).toBe("CUSTOMER");
    expect(json.data.user).not.toHaveProperty("passwordHash");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: json.data.user.id } });
    expect(row.role).toBe("CUSTOMER");
    expect(row.status).toBe("ACTIVE");
    expect(row.email).toBeNull();
    // Stored normalized, so the separators the customer typed here don't stop
    // them signing in with a differently spaced number later.
    expect(row.phone).toBe("09120001122");
    expect(row.passwordHash).not.toBe("Customer123!");
    expect(await verifyPassword("Customer123!", row.passwordHash)).toBe(true);

    const token = cookieJar.get(process.env.COOKIE_NAME!);
    expect(token).toBeTruthy();
    expect(await verifyToken(token!)).toEqual({ userId: row.id, role: "CUSTOMER" });
  });

  it("stores an optional email when one is supplied", async () => {
    const res = await POST(
      registerRequest(
        validBody({
          phone: "09120001133",
          email: `${PREFIX}@example.com`,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.user.email).toBe(`${PREFIX}@example.com`);
  });

  it("treats a blank email as omitted rather than rejecting it", async () => {
    const res = await POST(registerRequest(validBody({ phone: "09120001144", email: "" })));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.user.email).toBeNull();
  });

  it("returns 409 when the phone number is already registered, however it is spaced", async () => {
    const res = await POST(registerRequest(validBody({ phone: "0912-000-1122" })));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/phone/i);
    expect(cookieJar.size).toBe(0);
  });

  it("returns 409 when the email is already registered", async () => {
    const res = await POST(
      registerRequest(
        validBody({
          phone: "09120001155",
          email: "sara.ahmadi@example.com",
        }),
      ),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it("never lets the client ask for an admin account", async () => {
    const res = await POST(
      registerRequest(
        validBody({
          phone: "09120001166",
          role: "ADMIN",
          status: "INACTIVE",
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: json.data.user.id } });
    expect(row.role).toBe("CUSTOMER");
    expect(row.status).toBe("ACTIVE");
  });

  it("returns 400 for a missing name, a too-short password, and a junk phone", async () => {
    expect((await POST(registerRequest(validBody({ firstName: "  " })))).status).toBe(400);
    expect((await POST(registerRequest(validBody({ password: "short" })))).status).toBe(400);
    expect((await POST(registerRequest(validBody({ phone: "abc" })))).status).toBe(400);
    expect(cookieJar.size).toBe(0);
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/storefront/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.1.9.1",
        },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 once the same IP exceeds 5 sign-ups an hour", async () => {
    const ip = "10.1.99.1";

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await POST(registerRequest(validBody({ phone: `0912009900${attempt}` }), ip));
      expect(res.status).toBe(201);
    }

    const blocked = await POST(registerRequest(validBody({ phone: "09120099099" }), ip));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await prisma.user.count({ where: { phone: "09120099099" } })).toBe(0);
  });
});
