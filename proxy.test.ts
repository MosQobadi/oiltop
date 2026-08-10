import "dotenv/config";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import proxy from "./proxy";

function adminRequest(cookieValue?: string) {
  const headers = new Headers();
  if (cookieValue) {
    headers.set("cookie", `${process.env.COOKIE_NAME}=${cookieValue}`);
  }
  return new NextRequest("http://localhost/admin/products", { headers });
}

async function signToken(role: "ADMIN" | "CUSTOMER", userId = "user-1") {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function signExpiredToken(role: "ADMIN" | "CUSTOMER", userId = "user-1") {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowInSeconds - 60 * 60 * 24 * 8)
    .setExpirationTime(nowInSeconds - 60 * 60 * 24)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

describe("proxy (route protection for /admin/*)", () => {
  it("redirects to /login with a from param when there is no auth cookie", async () => {
    const res = await proxy(adminRequest());

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/admin/products");
  });

  it("redirects to /login when the token is invalid", async () => {
    const res = await proxy(adminRequest("not-a-real-token"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirects to /login when the token is expired", async () => {
    const res = await proxy(adminRequest(await signExpiredToken("ADMIN")));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirects to /login when the role is not ADMIN", async () => {
    const res = await proxy(adminRequest(await signToken("CUSTOMER")));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("allows the request through for a valid admin token", async () => {
    const res = await proxy(adminRequest(await signToken("ADMIN")));

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});

function accountRequest(url: string, cookieValue?: string) {
  const headers = new Headers();
  if (cookieValue) {
    headers.set("cookie", `${process.env.COOKIE_NAME}=${cookieValue}`);
  }
  return new NextRequest(`http://localhost${url}`, { headers });
}

describe("proxy (route protection for the account routes)", () => {
  it("redirects to the locale's login with a from param when there is no auth cookie", async () => {
    const res = await proxy(accountRequest("/en/orders"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/en/login");
    expect(location.searchParams.get("from")).toBe("/en/orders");
  });

  it("keeps the query string in the from param", async () => {
    const res = await proxy(accountRequest("/en/orders?page=2"));

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("from")).toBe("/en/orders?page=2");
  });

  it("redirects into the same locale tree the request came from", async () => {
    const res = await proxy(accountRequest("/fa/orders"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/fa/login");
  });

  it("protects paths nested under an account route", async () => {
    const res = await proxy(accountRequest("/en/orders/ord_123"));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/en/login");
    expect(location.searchParams.get("from")).toBe("/en/orders/ord_123");
  });

  it("redirects to login when the token is expired", async () => {
    const res = await proxy(accountRequest("/en/orders", await signExpiredToken("CUSTOMER")));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/en/login");
  });

  // An admin session is real but opens no account screen — AccountLoginForm
  // turns an admin away rather than letting the two loop.
  it("redirects to login when the role is not CUSTOMER", async () => {
    const res = await proxy(accountRequest("/en/orders", await signToken("ADMIN")));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/en/login");
  });

  it("allows the request through for a valid customer token", async () => {
    const res = await proxy(accountRequest("/en/orders", await signToken("CUSTOMER")));

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  // The guard reads PROTECTED_ACCOUNT_PATHS, but the matcher below it is a
  // hand-written list — a screen added to one and not the other is unprotected
  // in production and passes every test above, so /profile is checked too.
  it("guards the profile screen on the same terms as the orders screen", async () => {
    const anonymous = await proxy(accountRequest("/fa/profile"));
    expect(new URL(anonymous.headers.get("location")!).pathname).toBe("/fa/login");

    const asAdmin = await proxy(accountRequest("/en/profile", await signToken("ADMIN")));
    expect(new URL(asAdmin.headers.get("location")!).pathname).toBe("/en/login");

    const asCustomer = await proxy(accountRequest("/en/profile", await signToken("CUSTOMER")));
    expect(asCustomer.headers.get("location")).toBeNull();
  });

  it("leaves the public auth screens alone", async () => {
    for (const path of ["/en/login", "/fa/register"]) {
      const res = await proxy(accountRequest(path));

      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    }
  });
});

function rootRequest() {
  return new NextRequest("http://localhost/");
}

function mockSettings(defaultLocale: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { settings: { defaultLocale } } }), {
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("proxy (locale redirect for /)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to the default locale from Settings", async () => {
    mockSettings("FA");

    const res = await proxy(rootRequest());

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/fa");
  });

  it("asks the public settings route, not an admin one", async () => {
    const fetchSpy = mockSettings("EN");

    await proxy(rootRequest());

    const requestedUrl = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(requestedUrl.pathname).toBe("/api/storefront/settings");
  });

  it("falls back to en when the settings fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    const res = await proxy(rootRequest());

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en");
  });

  it("falls back to en when settings return an unusable locale", async () => {
    mockSettings("DE");

    const res = await proxy(rootRequest());

    expect(new URL(res.headers.get("location")!).pathname).toBe("/en");
  });
});
