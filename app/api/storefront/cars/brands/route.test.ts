import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// No next/headers mock and no cookie jar anywhere in this file — the route
// never reaches for a session, which is the point of the /api/storefront
// surface. Run against a seeded database (`pnpm prisma:seed`).

const SLUG_PREFIX = "test-storefront-brands";

afterAll(async () => {
  await prisma.carBrand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/storefront/cars/brands", () => {
  it("returns the seeded active car brands, unauthenticated", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const slugs = json.data.carBrands.map(
      (carBrand: { slug: string }) => carBrand.slug,
    );
    expect(slugs).toEqual(expect.arrayContaining(["toyota", "peugeot", "hyundai"]));
  });

  it("exposes only the public brand fields", async () => {
    const res = await GET();
    const json = await res.json();

    expect(Object.keys(json.data.carBrands[0]).sort()).toEqual([
      "id",
      "logo",
      "nameEn",
      "nameFa",
      "slug",
    ]);
  });

  it("omits INACTIVE car brands", async () => {
    const inactive = await prisma.carBrand.create({
      data: {
        slug: `${SLUG_PREFIX}-inactive`,
        nameEn: "Inactive Storefront Brand",
        nameFa: "برند غیرفعال",
        status: "INACTIVE",
      },
    });

    const res = await GET();
    const json = await res.json();

    expect(
      json.data.carBrands.some(
        (carBrand: { id: string }) => carBrand.id === inactive.id,
      ),
    ).toBe(false);
  });
});
