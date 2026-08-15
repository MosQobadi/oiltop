import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// Unauthenticated by construction — nothing here signs a token or sets a cookie.

const SLUG_PREFIX = "test-storefront-engines";

function request(query = "") {
  return new NextRequest(`http://localhost/api/storefront/cars/models/x/engines${query}`);
}

function ctx(modelId: string) {
  return { params: Promise.resolve({ modelId }) };
}

let corollaId: string;
let peugeot206Id: string;
// A model built here rather than read from the seed, so the "exactly one
// matching engine" case is deterministic even as the shared working database
// gains rows from admin use.
let singleEngineModelId: string;

beforeAll(async () => {
  corollaId = (
    await prisma.carModel.findFirstOrThrow({
      where: { slug: "corolla", carBrand: { slug: "toyota" } },
    })
  ).id;
  peugeot206Id = (
    await prisma.carModel.findFirstOrThrow({
      where: { slug: "206", carBrand: { slug: "peugeot" } },
    })
  ).id;

  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Engines Route Brand",
      nameFa: "برند",
      status: "ACTIVE",
    },
  });
  const carModel = await prisma.carModel.create({
    data: {
      carBrandId: carBrand.id,
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Engines Route Model",
      nameFa: "مدل",
      status: "ACTIVE",
    },
  });
  singleEngineModelId = carModel.id;

  await prisma.carEngine.create({
    data: {
      carModelId: carModel.id,
      labelEn: `${SLUG_PREFIX} Only Engine`,
      labelFa: "تنها موتور",
      yearStart: 2019,
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
      yearStart: 2019,
      yearEnd: 2021,
      fuelType: "DIESEL",
      status: "INACTIVE",
    },
  });
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

describe("GET /api/storefront/cars/models/:modelId/engines", () => {
  it("returns only the engines whose range covers the requested year", async () => {
    const res = await GET(request("?year=2016"), ctx(corollaId));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Corolla's 1.8L covers 2015-2017; its 1.6L only starts in 2018.
    const labels = json.data.carEngines.map((engine: { labelEn: string }) => engine.labelEn);
    expect(labels).toContain("1.8L VVT-i Petrol");
    expect(labels).not.toContain("1.6L Dual VVT-i Petrol");
    // The public projection, asserted key by key so a new column on CarEngine
    // can't ride along into an unauthenticated response by accident. `image` is
    // here deliberately: the type step renders a photo per type, falling back
    // to the model's when it's null.
    expect(Object.keys(json.data.carEngines[0]).sort()).toEqual([
      "displacementCc",
      "engineCode",
      "fuelType",
      "id",
      "image",
      "labelEn",
      "labelFa",
      "yearEnd",
      "yearStart",
    ]);
  });

  it("still returns an array when a model has exactly one matching engine", async () => {
    // The "skipped automatically" case from the design brief: the API shape
    // must not change for it — auto-skipping the Engine step is the client's
    // decision, so a lone engine is still wrapped in an array.
    const res = await GET(request("?year=2020"), ctx(singleEngineModelId));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.data.carEngines)).toBe(true);
    expect(json.data.carEngines).toHaveLength(1);
    expect(json.data.carEngines[0].labelEn).toBe(`${SLUG_PREFIX} Only Engine`);
  });

  it("returns the seeded single-engine model's engine", async () => {
    // Peugeot 206 is seeded with one engine (1.4L TU3, 2000-2010) — the same
    // case against real seed data.
    const res = await GET(request("?year=2005"), ctx(peugeot206Id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carEngines.map((engine: { labelEn: string }) => engine.labelEn)).toContain(
      "1.4L TU3 Petrol",
    );
  });

  it("returns an empty array for a year no engine covers", async () => {
    const res = await GET(request("?year=1995"), ctx(corollaId));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.carEngines).toEqual([]);
  });

  it("returns 400 when year is missing", async () => {
    const res = await GET(request(), ctx(corollaId));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
  });

  it("returns 400 for a non-numeric year", async () => {
    const res = await GET(request("?year=last-tuesday"), ctx(corollaId));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an out-of-range year", async () => {
    const res = await GET(request("?year=1300"), ctx(corollaId));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown model id", async () => {
    const res = await GET(request("?year=2020"), ctx("does-not-exist"));
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });
});
