import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET, POST } from "./route";

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

const SLUG_PREFIX = "test-brand-6-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/brands");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBrandPayload(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Test Brand 6.1",
    nameFa: "برند آزمایشی",
    status: "ACTIVE",
    ...overrides,
  };
}

let seededBrand: { slug: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  seededBrand = await prisma.brand.create({
    data: {
      slug: `${SLUG_PREFIX}-seed`,
      nameEn: "Castrol Test Seed",
      nameFa: "کاسترول آزمایشی",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.brand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/admin/brands", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("lists brands with productCount and total", async () => {
    const res = await GET(getRequest({ pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.brands)).toBe(true);
    expect(typeof json.data.total).toBe("number");
    const seeded = json.data.brands.find((b: { slug: string }) => b.slug === seededBrand.slug);
    expect(seeded).toBeTruthy();
    expect(typeof seeded.productCount).toBe("number");
  });

  it("filters by status", async () => {
    const res = await GET(getRequest({ status: "ACTIVE", pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.brands.every((b: { status: string }) => b.status === "ACTIVE")).toBe(true);
  });

  it("searches against both nameEn and nameFa", async () => {
    const enRes = await GET(getRequest({ search: "Castrol Test Seed" }));
    const enJson = await enRes.json();
    expect(enJson.data.brands.some((b: { slug: string }) => b.slug === seededBrand.slug)).toBe(
      true,
    );

    const faRes = await GET(getRequest({ search: "کاسترول آزمایشی" }));
    const faJson = await faRes.json();
    expect(faJson.data.brands.some((b: { slug: string }) => b.slug === seededBrand.slug)).toBe(
      true,
    );
  });
});

describe("POST /api/admin/brands", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(postRequest(validBrandPayload()));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects an invalid body", async () => {
    const res = await POST(postRequest({ nameEn: "Missing fields" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("auto-generates a slug from nameEn when not provided", async () => {
    const res = await POST(postRequest(validBrandPayload({ nameEn: `${SLUG_PREFIX} Auto Slug` })));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.brand.slug).toBe(`${SLUG_PREFIX}-auto-slug`);
  });

  it("rejects a duplicate slug with a clear error", async () => {
    const slug = `${SLUG_PREFIX}-dup`;
    const first = await POST(
      postRequest(validBrandPayload({ slug, nameEn: `${SLUG_PREFIX} Dup` })),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(validBrandPayload({ slug, nameEn: `${SLUG_PREFIX} Dup Again` })),
    );
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });
});
