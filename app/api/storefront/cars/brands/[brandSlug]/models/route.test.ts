import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// Unauthenticated by construction — nothing here signs a token or sets a cookie.

const SLUG_PREFIX = "test-storefront-models";

function request() {
  return new NextRequest("http://localhost/api/storefront/cars/brands/x/models");
}

function ctx(brandSlug: string) {
  return { params: Promise.resolve({ brandSlug }) };
}

afterAll(async () => {
  await prisma.carModel.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
  await prisma.carBrand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/storefront/cars/brands/:brandSlug/models", () => {
  it("returns the active models of a seeded brand", async () => {
    const res = await GET(request(), ctx("toyota"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // arrayContaining, not toEqual: these tests share the working database with
    // the admin panel, so a brand can gain models over time.
    expect(json.data.carModels.map((carModel: { slug: string }) => carModel.slug)).toEqual(
      expect.arrayContaining(["camry", "corolla"]),
    );
    expect(Object.keys(json.data.carModels[0]).sort()).toEqual([
      "id",
      "image",
      "nameEn",
      "nameFa",
      "slug",
    ]);
  });

  it("returns 404 for an unknown brand slug", async () => {
    const res = await GET(request(), ctx("not-a-real-brand"));
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 404 for a malformed brand slug", async () => {
    const res = await GET(request(), ctx("Not A Slug!"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an INACTIVE brand instead of leaking its models", async () => {
    const carBrand = await prisma.carBrand.create({
      data: {
        slug: `${SLUG_PREFIX}-inactive-brand`,
        nameEn: "Inactive Brand With Models",
        nameFa: "برند غیرفعال",
        status: "INACTIVE",
      },
    });
    await prisma.carModel.create({
      data: {
        carBrandId: carBrand.id,
        slug: `${SLUG_PREFIX}-hidden`,
        nameEn: "Hidden Model",
        nameFa: "مدل پنهان",
        status: "ACTIVE",
      },
    });

    const res = await GET(request(), ctx(carBrand.slug));
    expect(res.status).toBe(404);
  });

  it("omits INACTIVE models of an active brand", async () => {
    const carBrand = await prisma.carBrand.create({
      data: {
        slug: `${SLUG_PREFIX}-active-brand`,
        nameEn: "Active Brand",
        nameFa: "برند فعال",
        status: "ACTIVE",
      },
    });
    await prisma.carModel.create({
      data: {
        carBrandId: carBrand.id,
        slug: `${SLUG_PREFIX}-active`,
        nameEn: "Active Model",
        nameFa: "مدل فعال",
        status: "ACTIVE",
      },
    });
    await prisma.carModel.create({
      data: {
        carBrandId: carBrand.id,
        slug: `${SLUG_PREFIX}-inactive`,
        nameEn: "Inactive Model",
        nameFa: "مدل غیرفعال",
        status: "INACTIVE",
      },
    });

    const res = await GET(request(), ctx(carBrand.slug));
    const json = await res.json();

    expect(json.data.carModels.map((carModel: { slug: string }) => carModel.slug)).toEqual([
      `${SLUG_PREFIX}-active`,
    ]);
  });
});
