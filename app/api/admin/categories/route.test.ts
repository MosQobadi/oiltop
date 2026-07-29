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

const SLUG_PREFIX = "test-cat-5-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/categories");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validCategoryPayload(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Test Category 5.1",
    nameFa: "دسته آزمایشی",
    tags: ["test"],
    shortDescriptionEn: "Short desc",
    shortDescriptionFa: "توضیح کوتاه",
    longDescriptionEn: "Long desc",
    longDescriptionFa: "توضیح بلند",
    status: "ACTIVE",
    partType: "ACCESSORY",
    ...overrides,
  };
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
});

afterAll(async () => {
  await prisma.category.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/admin/categories", () => {
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

  it("lists categories with productCount and total", async () => {
    const res = await GET(getRequest({ pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.categories)).toBe(true);
    expect(typeof json.data.total).toBe("number");
    const engineOil = json.data.categories.find(
      (c: { slug: string }) => c.slug === "engine-oil",
    );
    expect(engineOil).toBeTruthy();
    expect(typeof engineOil.productCount).toBe("number");
    expect(engineOil.productCount).toBeGreaterThan(0);
  });

  it("filters by partType", async () => {
    const res = await GET(getRequest({ partType: "FILTER", pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.categories.every(
        (c: { partType: string }) => c.partType === "FILTER",
      ),
    ).toBe(true);
  });

  it("searches against both nameEn and nameFa", async () => {
    const enRes = await GET(getRequest({ search: "Engine Oil" }));
    const enJson = await enRes.json();
    expect(
      enJson.data.categories.some((c: { slug: string }) => c.slug === "engine-oil"),
    ).toBe(true);

    const faRes = await GET(getRequest({ search: "روغن موتور" }));
    const faJson = await faRes.json();
    expect(
      faJson.data.categories.some((c: { slug: string }) => c.slug === "engine-oil"),
    ).toBe(true);
  });
});

describe("POST /api/admin/categories", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(postRequest(validCategoryPayload()));
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
      postRequest(
        validCategoryPayload({ nameEn: `${SLUG_PREFIX} Auto Slug` }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.category.slug).toBe(`${SLUG_PREFIX}-auto-slug`);
  });

  it("rejects a duplicate slug with a clear error", async () => {
    const slug = `${SLUG_PREFIX}-dup`;
    const first = await POST(
      postRequest(validCategoryPayload({ slug, nameEn: `${SLUG_PREFIX} Dup` })),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(
        validCategoryPayload({ slug, nameEn: `${SLUG_PREFIX} Dup Again` }),
      ),
    );
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });

  it("forces filterKind to null when partType is not FILTER", async () => {
    const res = await POST(
      postRequest(
        validCategoryPayload({
          nameEn: `${SLUG_PREFIX} No Filter Kind`,
          partType: "ACCESSORY",
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.category.filterKind).toBeNull();
  });

  it("persists a valid partType/filterKind combination", async () => {
    const res = await POST(
      postRequest(
        validCategoryPayload({
          nameEn: `${SLUG_PREFIX} With Filter Kind`,
          partType: "FILTER",
          filterKind: "AIR_FILTER",
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.category.partType).toBe("FILTER");
    expect(json.data.category.filterKind).toBe("AIR_FILTER");
  });
});
