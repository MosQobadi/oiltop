import "dotenv/config";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function loginRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  cookieJar.clear();
});

describe("POST /api/auth/login", () => {
  it("logs in a valid admin and sets the auth cookie", async () => {
    const res = await POST(loginRequest({ email: "admin@topoil.com", password: "Admin123!" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe("admin@topoil.com");
    expect(json.data.user).not.toHaveProperty("passwordHash");
    expect(cookieJar.get(process.env.COOKIE_NAME!)).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    const res = await POST(loginRequest({ email: "admin@topoil.com", password: "wrong-password" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(cookieJar.size).toBe(0);
  });

  it("rejects a non-admin (customer) login with a clear error", async () => {
    const res = await POST(
      loginRequest({
        email: "sara.ahmadi@example.com",
        password: "Customer123!",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/administrator/i);
    expect(cookieJar.size).toBe(0);
  });

  it("rejects an invalid request body", async () => {
    const res = await POST(loginRequest({ email: "not-an-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
