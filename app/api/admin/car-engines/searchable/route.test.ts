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

const SLUG_PREFIX = "test-car-engines-searchable-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithQuery(query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  return new NextRequest(`http://localhost/api/admin/car-engines/searchable?${params.toString()}`);
}

let carBrand: { id: string };
let carModel: { id: string };
let engineInRange: { id: string };
let engineOutOfRange: { id: string };
let inactiveEngine: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  carBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Searchable Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  carModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Searchable Route",
      nameFa: "مدل آزمایشی",
      carBrandId: carBrand.id,
      status: "ACTIVE",
    },
  });
  engineInRange = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} In Range`,
      labelFa: "موتور در محدوده",
      carModelId: carModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  engineOutOfRange = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Out Of Range`,
      labelFa: "موتور خارج از محدوده",
      carModelId: carModel.id,
      yearStart: 2000,
      yearEnd: 2005,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  inactiveEngine = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Inactive`,
      labelFa: "موتور غیرفعال",
      carModelId: carModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "INACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("GET /api/admin/car-engines/searchable", () => {
  it("filters by brand, model, and year range", async () => {
    const res = await GET(
      requestWithQuery({
        carBrandId: carBrand.id,
        carModelId: carModel.id,
        yearFrom: "2016",
        yearTo: "2018",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    const ids = json.data.carEngines.map((e: { id: string }) => e.id);
    expect(ids).toContain(engineInRange.id);
    expect(ids).not.toContain(engineOutOfRange.id);
  });

  it("excludes inactive engines", async () => {
    const res = await GET(requestWithQuery({ carModelId: carModel.id }));
    const json = await res.json();

    const ids = json.data.carEngines.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(inactiveEngine.id);
  });

  it("composes a human-readable label with brand, model, and years", async () => {
    const res = await GET(requestWithQuery({ carModelId: carModel.id, search: "In Range" }));
    const json = await res.json();

    const found = json.data.carEngines.find((e: { id: string }) => e.id === engineInRange.id);
    expect(found.label).toContain("Test Brand For Searchable Route");
    expect(found.label).toContain("Test Model For Searchable Route");
    expect(found.label).toContain("2015");
  });

  it("rejects yearFrom greater than yearTo", async () => {
    const res = await GET(requestWithQuery({ yearFrom: "2020", yearTo: "2010" }));
    expect(res.status).toBe(400);
  });
});
