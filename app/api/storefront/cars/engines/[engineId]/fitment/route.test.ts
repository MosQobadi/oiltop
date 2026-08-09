import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// Unauthenticated by construction — nothing here signs a token or sets a cookie.

const SLUG_PREFIX = "test-storefront-fitment";

type ResolvedItem = {
  climate: string;
  product: { id: string; finalPrice: number } | null;
  specNote: string | null;
  specAttributes: unknown;
};
type Group = {
  category: { nameEn: string; partType: string; filterKind: string | null };
  items: ResolvedItem[];
};

function request() {
  return new NextRequest(
    "http://localhost/api/storefront/cars/engines/x/fitment",
  );
}

function ctx(engineId: string) {
  return { params: Promise.resolve({ engineId }) };
}

let peugeot206EngineId: string;
let corollaDualEngineId: string;

beforeAll(async () => {
  peugeot206EngineId = (
    await prisma.carEngine.findFirstOrThrow({
      where: {
        labelEn: "1.4L TU3 Petrol",
        carModel: { slug: "206", carBrand: { slug: "peugeot" } },
      },
    })
  ).id;
  corollaDualEngineId = (
    await prisma.carEngine.findFirstOrThrow({
      where: {
        labelEn: "1.6L Dual VVT-i Petrol",
        carModel: { slug: "corolla", carBrand: { slug: "toyota" } },
      },
    })
  ).id;
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

describe("GET /api/storefront/cars/engines/:engineId/fitment", () => {
  it("returns the breadcrumb the storefront renders above the results", async () => {
    const res = await GET(request(), ctx(peugeot206EngineId));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.carBrand.nameEn).toBe("Peugeot");
    expect(json.data.carBrand.nameFa).toBe("پژو");
    expect(json.data.carModel.nameEn).toBe("206");
    expect(json.data.carEngine.labelEn).toBe("1.4L TU3 Petrol");
    expect(json.data.carEngine.yearStart).toBe(2000);
    expect(json.data.carEngine.yearEnd).toBe(2010);
  });

  it("resolves the seeded spec-only engine oil item with no product", async () => {
    const res = await GET(request(), ctx(peugeot206EngineId));
    const json = await res.json();

    const oilGroup = json.data.groups.find(
      (group: Group) => group.category.partType === "ENGINE_OIL",
    );
    // Matched by content, not position: these tests share the working database
    // with the admin panel, so an engine can pick up extra profiles over time.
    const specOnly = oilGroup.items.find(
      (item: ResolvedItem) => item.product === null,
    );
    expect(specOnly).toBeDefined();
    expect(specOnly.specNote).toMatch(/No catalog match yet/i);
    expect(specOnly.specAttributes).toMatchObject({
      viscosity: "5W-30 or 10W-40",
    });
  });

  it("groups the oil first, then the four filter kinds", async () => {
    const res = await GET(request(), ctx(peugeot206EngineId));
    const json = await res.json();

    const filterKinds = json.data.groups.map(
      (group: Group) => group.category.filterKind,
    );
    expect(filterKinds[0]).toBeNull();
    expect(json.data.groups[0].category.partType).toBe("ENGINE_OIL");
    expect(filterKinds).toEqual(
      expect.arrayContaining([
        "OIL_FILTER",
        "AIR_FILTER",
        "CABIN_FILTER",
        "FUEL_FILTER",
      ]),
    );
  });

  it("returns both climate variants for a HOT/COLD engine, with finalPrice", async () => {
    const res = await GET(request(), ctx(corollaDualEngineId));
    const json = await res.json();

    const oilGroup = json.data.groups.find(
      (group: Group) => group.category.partType === "ENGINE_OIL",
    );
    const climates = oilGroup.items.map((item: ResolvedItem) => item.climate);
    expect(climates).toEqual(expect.arrayContaining(["HOT", "COLD"]));

    for (const climate of ["HOT", "COLD"]) {
      const item = oilGroup.items.find(
        (candidate: ResolvedItem) => candidate.climate === climate,
      );
      expect(item.product).not.toBeNull();
      expect(typeof item.product.finalPrice).toBe("number");
    }
  });

  it("never exposes the admin-only notes", async () => {
    const res = await GET(request(), ctx(corollaDualEngineId));
    const body = await res.text();

    expect(body).not.toMatch(/adminNote|internalNote/);
  });

  it("returns 404 for an unknown engine id", async () => {
    const res = await GET(request(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 404 for an INACTIVE engine", async () => {
    const carBrand = await prisma.carBrand.create({
      data: {
        slug: `${SLUG_PREFIX}-brand`,
        nameEn: "Fitment Brand",
        nameFa: "برند",
        status: "ACTIVE",
      },
    });
    const carModel = await prisma.carModel.create({
      data: {
        carBrandId: carBrand.id,
        slug: `${SLUG_PREFIX}-model`,
        nameEn: "Fitment Model",
        nameFa: "مدل",
        status: "ACTIVE",
      },
    });
    const carEngine = await prisma.carEngine.create({
      data: {
        carModelId: carModel.id,
        labelEn: `${SLUG_PREFIX} Inactive Engine`,
        labelFa: "موتور غیرفعال",
        yearStart: 2010,
        fuelType: "PETROL",
        status: "INACTIVE",
      },
    });

    const res = await GET(request(), ctx(carEngine.id));
    expect(res.status).toBe(404);
  });

  it("returns an empty group list for an engine with no fitment profile", async () => {
    const carBrand = await prisma.carBrand.create({
      data: {
        slug: `${SLUG_PREFIX}-bare-brand`,
        nameEn: "Bare Fitment Brand",
        nameFa: "برند",
        status: "ACTIVE",
      },
    });
    const carModel = await prisma.carModel.create({
      data: {
        carBrandId: carBrand.id,
        slug: `${SLUG_PREFIX}-bare-model`,
        nameEn: "Bare Fitment Model",
        nameFa: "مدل",
        status: "ACTIVE",
      },
    });
    const carEngine = await prisma.carEngine.create({
      data: {
        carModelId: carModel.id,
        labelEn: `${SLUG_PREFIX} Bare Engine`,
        labelFa: "موتور بدون پروفایل",
        yearStart: 2010,
        fuelType: "PETROL",
        status: "ACTIVE",
      },
    });

    const res = await GET(request(), ctx(carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.groups).toEqual([]);
  });
});
