import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SETTINGS_KEYS } from "@/lib/validation";
import { GET, PATCH } from "./route";

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

const PREFIX = "test-settings-13-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/settings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
});

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: { startsWith: PREFIX } } });
  await prisma.setting.deleteMany({
    where: { key: { in: Object.values(SETTINGS_KEYS).flatMap((g) => Object.values(g)) } },
  });
});

describe("GET /api/admin/settings", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET();
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("returns settings grouped by tab with defaults for unset keys", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty("general");
    expect(json.data).toHaveProperty("seo");
    expect(json.data).toHaveProperty("localization");
    expect(json.data).toHaveProperty("shipping");
    expect(json.data).toHaveProperty("payment");
    expect(json.data.localization.supportedLocales).toEqual(["EN", "FA"]);
  });
});

describe("PATCH /api/admin/settings", () => {
  it("upserts provided keys and returns updated settings", async () => {
    const res = await PATCH(
      requestWithBody("PATCH", {
        [SETTINGS_KEYS.general.storeName]: "Top Oil",
        [SETTINGS_KEYS.seo.sitemapEnabled]: "true",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.general.storeName).toBe("Top Oil");
    expect(json.data.seo.sitemapEnabled).toBe(true);

    const row = await prisma.setting.findUnique({
      where: { key: SETTINGS_KEYS.general.storeName },
    });
    expect(row?.value).toBe("Top Oil");
  });

  it("rejects an unknown key", async () => {
    const res = await PATCH(requestWithBody("PATCH", { "not.a.real.key": "value" }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty body", async () => {
    const res = await PATCH(requestWithBody("PATCH", {}));
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await PATCH(
      requestWithBody("PATCH", { [SETTINGS_KEYS.general.storeName]: "Nope" }),
    );
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});
