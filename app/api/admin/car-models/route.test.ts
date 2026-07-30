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

const SLUG_PREFIX = "test-car-model-8-2";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/car-models");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/car-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validCarModelPayload(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Test Car Model 8.2",
    nameFa: "مدل خودرو آزمایشی",
    status: "ACTIVE",
    ...overrides,
  };
}

let seededCarBrandA: { id: string };
let seededCarBrandB: { id: string };
let seededCarModel: { slug: string; carBrandId: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  seededCarBrandA = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand-a`,
      nameEn: "Test Brand A",
      nameFa: "برند آزمایشی الف",
      status: "ACTIVE",
    },
  });
  seededCarBrandB = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand-b`,
      nameEn: "Test Brand B",
      nameFa: "برند آزمایشی ب",
      status: "ACTIVE",
    },
  });

  seededCarModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-seed`,
      nameEn: "Corolla Test Seed",
      nameFa: "کرولا آزمایشی",
      carBrandId: seededCarBrandA.id,
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("GET /api/admin/car-models", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest({ carBrandId: seededCarBrandA.id }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects a request without carBrandId", async () => {
    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("scopes results to the given carBrandId with engineCount and total", async () => {
    const res = await GET(getRequest({ carBrandId: seededCarBrandA.id, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(
      json.data.carModels.every(
        (m: { carBrandId: string }) => m.carBrandId === seededCarBrandA.id,
      ),
    ).toBe(true);
    const seeded = json.data.carModels.find(
      (m: { slug: string }) => m.slug === seededCarModel.slug,
    );
    expect(seeded).toBeTruthy();
    expect(typeof seeded.engineCount).toBe("number");
  });

  it("does not return models from a different car brand", async () => {
    const res = await GET(getRequest({ carBrandId: seededCarBrandB.id, pageSize: "100" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.carModels.some((m: { slug: string }) => m.slug === seededCarModel.slug),
    ).toBe(false);
  });

  it("filters by status", async () => {
    const res = await GET(
      getRequest({ carBrandId: seededCarBrandA.id, status: "ACTIVE", pageSize: "100" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.data.carModels.every((m: { status: string }) => m.status === "ACTIVE"),
    ).toBe(true);
  });

  it("searches against both nameEn and nameFa", async () => {
    const enRes = await GET(
      getRequest({ carBrandId: seededCarBrandA.id, search: "Corolla Test Seed" }),
    );
    const enJson = await enRes.json();
    expect(
      enJson.data.carModels.some((m: { slug: string }) => m.slug === seededCarModel.slug),
    ).toBe(true);

    const faRes = await GET(
      getRequest({ carBrandId: seededCarBrandA.id, search: "کرولا آزمایشی" }),
    );
    const faJson = await faRes.json();
    expect(
      faJson.data.carModels.some((m: { slug: string }) => m.slug === seededCarModel.slug),
    ).toBe(true);
  });
});

describe("POST /api/admin/car-models", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await POST(
      postRequest(validCarModelPayload({ carBrandId: seededCarBrandA.id })),
    );
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
        validCarModelPayload({
          carBrandId: seededCarBrandA.id,
          nameEn: `${SLUG_PREFIX} Auto Slug`,
        }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.carModel.slug).toBe(`${SLUG_PREFIX}-auto-slug`);
  });

  it("rejects a duplicate slug within the same car brand", async () => {
    const slug = `${SLUG_PREFIX}-dup`;
    const first = await POST(
      postRequest(
        validCarModelPayload({
          carBrandId: seededCarBrandA.id,
          slug,
          nameEn: `${SLUG_PREFIX} Dup`,
        }),
      ),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(
        validCarModelPayload({
          carBrandId: seededCarBrandA.id,
          slug,
          nameEn: `${SLUG_PREFIX} Dup Again`,
        }),
      ),
    );
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });

  it("allows the same slug across different car brands", async () => {
    const slug = `${SLUG_PREFIX}-shared`;
    const first = await POST(
      postRequest(
        validCarModelPayload({
          carBrandId: seededCarBrandA.id,
          slug,
          nameEn: `${SLUG_PREFIX} Shared A`,
        }),
      ),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      postRequest(
        validCarModelPayload({
          carBrandId: seededCarBrandB.id,
          slug,
          nameEn: `${SLUG_PREFIX} Shared B`,
        }),
      ),
    );
    expect(second.status).toBe(201);
  });
});
