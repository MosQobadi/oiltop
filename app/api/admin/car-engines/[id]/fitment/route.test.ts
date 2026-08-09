import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

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

const SLUG_PREFIX = "test-car-engine-fitment-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let carEngine: { id: string };
let profileA: { id: string };
let profileB: { id: string };
let engineOilCategory: { id: string };
let oilFilterCategory: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  oilFilterCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "oil-filter" },
  });

  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Engine Fitment Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  const carModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Engine Fitment Route",
      nameFa: "مدل آزمایشی",
      carBrandId: carBrand.id,
      status: "ACTIVE",
    },
  });
  carEngine = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine`,
      labelFa: "موتور آزمایشی",
      carModelId: carModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });

  profileA = await prisma.fitmentProfile.create({
    data: { label: `${SLUG_PREFIX} Profile A` },
  });
  profileB = await prisma.fitmentProfile.create({
    data: { label: `${SLUG_PREFIX} Profile B` },
  });

  await prisma.fitmentProfileItem.create({
    data: {
      profileId: profileA.id,
      categoryId: engineOilCategory.id,
      specNote: `${SLUG_PREFIX} oil spec`,
      priority: 5,
    },
  });
  await prisma.fitmentProfileItem.create({
    data: {
      profileId: profileB.id,
      categoryId: oilFilterCategory.id,
      specNote: `${SLUG_PREFIX} filter spec`,
    },
  });
  // Same category as profile A's item but a lower priority — the two profiles
  // attached to one engine must merge into a single priority-ordered group.
  await prisma.fitmentProfileItem.create({
    data: {
      profileId: profileB.id,
      categoryId: engineOilCategory.id,
      specNote: `${SLUG_PREFIX} preferred oil spec`,
      priority: 1,
    },
  });

  await prisma.carEngineFitmentProfile.create({
    data: { carEngineId: carEngine.id, profileId: profileA.id },
  });
  await prisma.carEngineFitmentProfile.create({
    data: { carEngineId: carEngine.id, profileId: profileB.id },
  });
});

afterAll(async () => {
  await prisma.carEngineFitmentProfile.deleteMany({ where: { carEngineId: carEngine.id } });
  await prisma.fitmentProfileItem.deleteMany({
    where: { profile: { label: { startsWith: SLUG_PREFIX } } },
  });
  await prisma.fitmentProfile.deleteMany({ where: { label: { startsWith: SLUG_PREFIX } } });
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

interface ResponseGroup {
  category: { id: string };
  items: { specNote: string | null; priority: number }[];
}

describe("GET /api/admin/car-engines/:id/fitment", () => {
  it("groups items by category across every attached fitment profile", async () => {
    const res = await GET(new NextRequest("http://localhost/x"), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const groups: ResponseGroup[] = json.data.groups;
    expect(groups).toHaveLength(2);
    const categoryIds = groups.map((group) => group.category.id);
    expect(categoryIds).toContain(engineOilCategory.id);
    expect(categoryIds).toContain(oilFilterCategory.id);
  });

  it("orders items sharing a category by priority, across profiles", async () => {
    const res = await GET(new NextRequest("http://localhost/x"), ctx(carEngine.id));
    const json = await res.json();

    const groups: ResponseGroup[] = json.data.groups;
    const oilGroup = groups.find((group) => group.category.id === engineOilCategory.id);
    expect(oilGroup?.items.map((item) => item.specNote)).toEqual([
      `${SLUG_PREFIX} preferred oil spec`,
      `${SLUG_PREFIX} oil spec`,
    ]);
  });

  it("returns an empty list for an engine with no attached profiles", async () => {
    const carModel = await prisma.carModel.findFirstOrThrow({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
    const bareEngine = await prisma.carEngine.create({
      data: {
        labelEn: `${SLUG_PREFIX} Bare Engine`,
        labelFa: "موتور بدون تناسب",
        carModelId: carModel.id,
        yearStart: 2015,
        yearEnd: 2020,
        fuelType: "PETROL",
        status: "ACTIVE",
      },
    });

    const res = await GET(new NextRequest("http://localhost/x"), ctx(bareEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.groups).toHaveLength(0);

    await prisma.carEngine.delete({ where: { id: bareEngine.id } });
  });
});
