import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// Unauthenticated by construction — nothing here signs a token or sets a cookie.

const SLUG_PREFIX = "test-storefront-years";

function request() {
  return new NextRequest("http://localhost/api/storefront/cars/models/x/years");
}

function ctx(modelId: string) {
  return { params: Promise.resolve({ modelId }) };
}

let corollaId: string;

beforeAll(async () => {
  const corolla = await prisma.carModel.findFirstOrThrow({
    where: { slug: "corolla", carBrand: { slug: "toyota" } },
  });
  corollaId = corolla.id;
});

afterAll(async () => {
  await prisma.carEngine.deleteMany({
    where: { labelEn: { startsWith: SLUG_PREFIX } },
  });
  await prisma.carModel.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
  await prisma.carBrand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

async function createModel(
  brandStatus: "ACTIVE" | "INACTIVE",
  modelStatus: "ACTIVE" | "INACTIVE",
  suffix: string,
) {
  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-${suffix}`,
      nameEn: `Years Brand ${suffix}`,
      nameFa: "برند",
      status: brandStatus,
    },
  });
  return prisma.carModel.create({
    data: {
      yearCalendar: "GREGORIAN",
      carBrandId: carBrand.id,
      slug: `${SLUG_PREFIX}-${suffix}`,
      nameEn: `Years Model ${suffix}`,
      nameFa: "مدل",
      status: modelStatus,
    },
  });
}

describe("GET /api/storefront/cars/models/:modelId/years", () => {
  it("expands the seeded model's engine ranges, newest first", async () => {
    const res = await GET(request(), ctx(corollaId));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Corolla's two seeded engines cover 2015-2017 and 2018-2022. Asserted as
    // "contains, and is sorted" rather than an exact list because these tests
    // share the working database with the admin panel, where engines can be
    // added over time.
    expect(json.data.years).toEqual(
      expect.arrayContaining([2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015]),
    );
    expect(json.data.years).toEqual([...json.data.years].sort((a: number, b: number) => b - a));
  });

  it("returns 404 for an unknown model id", async () => {
    const res = await GET(request(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 404 for an INACTIVE model", async () => {
    const carModel = await createModel("ACTIVE", "INACTIVE", "inactive-model");
    const res = await GET(request(), ctx(carModel.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an active model under an INACTIVE brand", async () => {
    const carModel = await createModel("INACTIVE", "ACTIVE", "inactive-brand");
    const res = await GET(request(), ctx(carModel.id));
    expect(res.status).toBe(404);
  });

  it("omits years contributed only by INACTIVE engines", async () => {
    const carModel = await createModel("ACTIVE", "ACTIVE", "engine-status");
    await prisma.carEngine.create({
      data: {
        carModelId: carModel.id,
        labelEn: `${SLUG_PREFIX} Active Engine`,
        labelFa: "موتور فعال",
        yearStart: 2020,
        yearEnd: 2021,
        fuelType: "PETROL",
        status: "ACTIVE",
      },
    });
    await prisma.carEngine.create({
      data: {
        carModelId: carModel.id,
        labelEn: `${SLUG_PREFIX} Inactive Engine`,
        labelFa: "موتور غیرفعال",
        yearStart: 2005,
        yearEnd: 2006,
        fuelType: "PETROL",
        status: "INACTIVE",
      },
    });

    const res = await GET(request(), ctx(carModel.id));
    const json = await res.json();

    expect(json.data.years).toEqual([2021, 2020]);
  });
});
