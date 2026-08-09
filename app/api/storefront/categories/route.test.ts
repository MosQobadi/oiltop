import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).

const SLUG_PREFIX = "test-storefront-categories";

afterAll(async () => {
  await prisma.category.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/storefront/categories", () => {
  it("returns the seeded active categories, unauthenticated", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const slugs = json.data.categories.map((c: { slug: string }) => c.slug);
    expect(slugs).toEqual(expect.arrayContaining(["engine-oil", "oil-filter", "air-filter"]));
  });

  it("exposes partType and filterKind but no admin-only fields", async () => {
    const res = await GET();
    const json = await res.json();

    const airFilter = json.data.categories.find((c: { slug: string }) => c.slug === "air-filter");
    expect(airFilter.partType).toBe("FILTER");
    expect(airFilter.filterKind).toBe("AIR_FILTER");

    expect(Object.keys(airFilter).sort()).toEqual([
      "filterKind",
      "id",
      "image",
      "nameEn",
      "nameFa",
      "partType",
      "slug",
    ]);
  });

  it("omits INACTIVE categories", async () => {
    const inactive = await prisma.category.create({
      data: {
        slug: `${SLUG_PREFIX}-inactive`,
        nameEn: "Inactive Storefront Category",
        nameFa: "دسته غیرفعال",
        shortDescriptionEn: "Short",
        shortDescriptionFa: "کوتاه",
        longDescriptionEn: "Long",
        longDescriptionFa: "بلند",
        partType: "ACCESSORY",
        status: "INACTIVE",
      },
    });

    const res = await GET();
    const json = await res.json();

    expect(json.data.categories.some((c: { id: string }) => c.id === inactive.id)).toBe(false);
  });
});
