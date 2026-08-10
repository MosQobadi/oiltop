import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { POST } from "./route";

// next/headers' cookies() requires Next's request-scoped storage, which
// doesn't exist when a route handler is invoked directly in a test runner.
// Fake the cookie jar so the real login logic (DB lookup, bcrypt, JWT) still
// runs end-to-end.
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

// The route rate-limits per IP and the limiter is module state shared across
// this file's cases, so each request claims its own address rather than the
// fifth test tripping the fourth one's limit.
let requestCount = 0;

function loginRequest(body: unknown) {
  requestCount += 1;
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.0.0.${requestCount}`,
    },
    body: JSON.stringify(body),
  });
}

// The seed has no deactivated user — the case only exists once an admin flips
// a customer's status, so this file makes one.
const PREFIX = "test-login-route";
const DEACTIVATED_PHONE = "+989990001111";

beforeAll(async () => {
  await prisma.user.create({
    data: {
      phone: DEACTIVATED_PHONE,
      passwordHash: await hashPassword("Customer123!"),
      firstName: PREFIX,
      lastName: "Deactivated",
      role: "CUSTOMER",
      status: "INACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { firstName: PREFIX } });
});

beforeEach(() => {
  cookieJar.clear();
});

describe("POST /api/auth/login", () => {
  it("logs in a valid admin and sets the auth cookie", async () => {
    const res = await POST(loginRequest({ identifier: "admin@topoil.com", password: "Admin123!" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe("admin@topoil.com");
    expect(json.data.user).not.toHaveProperty("passwordHash");
    expect(cookieJar.get(process.env.COOKIE_NAME!)).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    const res = await POST(
      loginRequest({ identifier: "admin@topoil.com", password: "wrong-password" }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(cookieJar.size).toBe(0);
  });

  // The role check moved out of this route in Task 7.1 — the storefront and
  // the admin panel share one session, and ADMIN-only is enforced by proxy.ts
  // and requireAdmin() instead.
  it("logs in a customer by email", async () => {
    const res = await POST(
      loginRequest({ identifier: "sara.ahmadi@example.com", password: "Customer123!" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.user.role).toBe("CUSTOMER");
    expect(cookieJar.get(process.env.COOKIE_NAME!)).toBeTruthy();
  });

  it("logs in a customer by phone number", async () => {
    const res = await POST(loginRequest({ identifier: "+989351112233", password: "Customer123!" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.user.email).toBe("sara.ahmadi@example.com");
  });

  it("logs in a customer whose phone is typed with separators", async () => {
    const res = await POST(
      loginRequest({ identifier: "+98 935 111 2233", password: "Customer123!" }),
    );

    expect(res.status).toBe(200);
  });

  it("rejects an unknown identifier without saying which part was wrong", async () => {
    const res = await POST(loginRequest({ identifier: "+989000000000", password: "Customer123!" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Invalid credentials");
    expect(cookieJar.size).toBe(0);
  });

  it("rejects a deactivated account with 403 and no cookie", async () => {
    const res = await POST(
      loginRequest({ identifier: DEACTIVATED_PHONE, password: "Customer123!" }),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/deactivated/i);
    expect(cookieJar.size).toBe(0);
  });

  it("rejects an invalid request body", async () => {
    const res = await POST(loginRequest({ identifier: "" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("rate-limits repeated attempts from one IP", async () => {
    const attempt = () =>
      POST(
        new NextRequest("http://localhost/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "10.9.9.9",
          },
          body: JSON.stringify({ identifier: "admin@topoil.com", password: "wrong-password" }),
        }),
      );

    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
