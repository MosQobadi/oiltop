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

const SLUG_PREFIX = "test-car-brand-8-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/car-brands");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/car-brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validCarBrandPayload(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Test Car Brand 8.1",
    nameFa: "برند خودرو آزمایشی",
    status: "ACTIVE",
    ...overrides,
  };
}

let seededCarBrand: { slug: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  seededCarBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-seed`,
      nameEn: "Toyota Test Seed",
      nameFa: "تویوتا آزمایشی",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.carBrand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/admin/car-brands", () => {
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

  it("lists car brands with modelCount and total", async () => {
    const res = await GET(getRequest({ pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.carBrands)).toBe(true);
    expect(typeof json.data.total).toBe("number");
    const seeded = json.data.carBrands.find(
      (b: { slug: string }) => b.slug === seededCarBrand.slug,
    );
    expect(seeded).toBeTruthy();
    expect(typeof seeded.modelCount).toBe("number");
  });

  it("filters by status", async () => {
    const res = await GET(getRequest({ status: "ACTIVE", pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.carBrands.every((b: { status: string }) => b.status === "ACTIVE"),
    ).toBe(true);
  });

  it("searches against both nameEn and nameFa", async () => {
    const enRes = await GET(getRequest({ search: "Toyota Test Seed" }));
    const enJson = await enRes.json();
    expect(
      enJson.data.carBrands.some((b: { slug: string }) => b.slug === seededCarBrand.slug),
    ).toBe(true);

    const faRes = await GET(getRequest({ search: "تویوتا آزمایشی" }));
    const faJson = await faRes.json();
    expect(
      faJson.data.carBrands.some((b: { slug: string }) => b.slug === seededCarBrand.slug),
    ).toBe(true);
  });
});

describe("POST /api/admin/car-brands", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(postRequest(validCarBrandPayload()));
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
    const res = await POST(
      postRequest(validCarBrandPayload({ nameEn: `${SLUG_PREFIX} Auto Slug` })),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.carBrand.slug).toBe(`${SLUG_PREFIX}-auto-slug`);
  });

  it("rejects a duplicate slug with a clear error", async () => {
    const slug = `${SLUG_PREFIX}-dup`;
    const first = await POST(
      postRequest(validCarBrandPayload({ slug, nameEn: `${SLUG_PREFIX} Dup` })),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(
        validCarBrandPayload({ slug, nameEn: `${SLUG_PREFIX} Dup Again` }),
      ),
    );
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });
});
