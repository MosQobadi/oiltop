import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).

const SLUG_PREFIX = "test-storefront-product-brands";

afterAll(async () => {
  await prisma.brand.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
});

describe("GET /api/storefront/brands", () => {
  it("returns the seeded active product brands, unauthenticated", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const slugs = json.data.brands.map((b: { slug: string }) => b.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["mobil-1", "castrol", "bosch", "mann-filter"]),
    );
  });

  it("exposes only the public brand fields", async () => {
    const res = await GET();
    const json = await res.json();

    expect(Object.keys(json.data.brands[0]).sort()).toEqual([
      "id",
      "logo",
      "nameEn",
      "nameFa",
      "slug",
    ]);
  });

  it("omits INACTIVE brands", async () => {
    const inactive = await prisma.brand.create({
      data: {
        slug: `${SLUG_PREFIX}-inactive`,
        nameEn: "Inactive Storefront Product Brand",
        nameFa: "برند غیرفعال",
        status: "INACTIVE",
      },
    });

    const res = await GET();
    const json = await res.json();

    expect(json.data.brands.some((b: { id: string }) => b.id === inactive.id)).toBe(
      false,
    );
  });
});
