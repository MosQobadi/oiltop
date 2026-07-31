import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE, GET, PATCH } from "./route";

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

const LABEL_PREFIX = "Test Fitment Profile Id Route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment-profiles/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let seededCarEngine: { id: string };
let engineOilCategory: { id: string };

async function createTestProfile(overrides: Record<string, unknown> = {}) {
  return prisma.fitmentProfile.create({
    data: { label: `${LABEL_PREFIX} Profile`, ...overrides },
  });
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${LABEL_PREFIX.toLowerCase().replace(/\s+/g, "-")}-brand`,
      nameEn: "Test Brand For Profile Id Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  const carModel = await prisma.carModel.create({
    data: {
      slug: `${LABEL_PREFIX.toLowerCase().replace(/\s+/g, "-")}-model`,
      nameEn: "Test Model For Profile Id Route",
      nameFa: "مدل آزمایشی",
      carBrandId: carBrand.id,
      status: "ACTIVE",
    },
  });
  seededCarEngine = await prisma.carEngine.create({
    data: {
      labelEn: `${LABEL_PREFIX} Engine`,
      labelFa: "موتور آزمایشی",
      carModelId: carModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
});

afterAll(async () => {
  await prisma.carEngineFitmentProfile.deleteMany({
    where: { carEngineId: seededCarEngine.id },
  });
  await prisma.fitmentProfileItem.deleteMany({
    where: { profile: { label: { startsWith: LABEL_PREFIX } } },
  });
  await prisma.fitmentProfile.deleteMany({
    where: { label: { startsWith: LABEL_PREFIX } },
  });
  await prisma.carEngine.deleteMany({ where: { id: seededCarEngine.id } });
  await prisma.carModel.deleteMany({
    where: { slug: { startsWith: LABEL_PREFIX.toLowerCase().replace(/\s+/g, "-") } },
  });
  await prisma.carBrand.deleteMany({
    where: { slug: { startsWith: LABEL_PREFIX.toLowerCase().replace(/\s+/g, "-") } },
  });
});

describe("GET /api/admin/fitment-profiles/:id", () => {
  it("returns the profile with joined items and linked engines", async () => {
    const profile = await createTestProfile();
    await prisma.fitmentProfileItem.create({
      data: {
        profileId: profile.id,
        categoryId: engineOilCategory.id,
        specNote: `${LABEL_PREFIX} spec`,
      },
    });
    await prisma.carEngineFitmentProfile.create({
      data: { carEngineId: seededCarEngine.id, profileId: profile.id },
    });

    const res = await GET(requestWithBody("GET"), ctx(profile.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.fitmentProfile.items).toHaveLength(1);
    expect(json.data.fitmentProfile.carEngineLinks).toHaveLength(1);
    expect(json.data.fitmentProfile.carEngineLinks[0].carEngine.id).toBe(
      seededCarEngine.id,
    );

    await prisma.carEngineFitmentProfile.deleteMany({ where: { profileId: profile.id } });
    await prisma.fitmentProfileItem.deleteMany({ where: { profileId: profile.id } });
    await prisma.fitmentProfile.delete({ where: { id: profile.id } });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(requestWithBody("GET"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/admin/fitment-profiles/:id", () => {
  it("updates the label and internal note", async () => {
    const profile = await createTestProfile();
    const res = await PATCH(
      requestWithBody("PATCH", { label: `${LABEL_PREFIX} Renamed`, internalNote: "note" }),
      ctx(profile.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.fitmentProfile.label).toBe(`${LABEL_PREFIX} Renamed`);
    expect(json.data.fitmentProfile.internalNote).toBe("note");

    await prisma.fitmentProfile.delete({ where: { id: profile.id } });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(requestWithBody("PATCH", { label: "x" }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/fitment-profiles/:id", () => {
  it("deletes a profile with no linked engines (and its items)", async () => {
    const profile = await createTestProfile();
    await prisma.fitmentProfileItem.create({
      data: {
        profileId: profile.id,
        categoryId: engineOilCategory.id,
        specNote: `${LABEL_PREFIX} spec`,
      },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(profile.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.fitmentProfile.findUnique({ where: { id: profile.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("soft-fails with a clear error when linked to a car engine", async () => {
    const profile = await createTestProfile();
    await prisma.carEngineFitmentProfile.create({
      data: { carEngineId: seededCarEngine.id, profileId: profile.id },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(profile.id));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/car engine/i);

    const stillExists = await prisma.fitmentProfile.findUnique({
      where: { id: profile.id },
    });
    expect(stillExists).not.toBeNull();

    await prisma.carEngineFitmentProfile.deleteMany({ where: { profileId: profile.id } });
    await prisma.fitmentProfile.delete({ where: { id: profile.id } });
  });
});
