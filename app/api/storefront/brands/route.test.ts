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
    expect(slugs).toEqual(expect.arrayContaining(["mobil-1", "castrol", "bosch", "mann-filter"]));
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

  it("puts pinned brands first, in order, and unordered ones after them", async () => {
    // Named so alphabetical order alone would produce the exact opposite:
    // "zzz" pinned to 1 has to beat "aaa" with no position at all.
    const [pinnedLast, pinnedFirst, unordered] = await Promise.all([
      prisma.brand.create({
        data: {
          slug: `${SLUG_PREFIX}-mmm`,
          nameEn: "Mmm",
          nameFa: "برند آزمایشی",
          status: "ACTIVE",
          sortOrder: 2,
        },
      }),
      prisma.brand.create({
        data: {
          slug: `${SLUG_PREFIX}-zzz`,
          nameEn: "Zzz",
          nameFa: "برند آزمایشی",
          status: "ACTIVE",
          sortOrder: 1,
        },
      }),
      prisma.brand.create({
        data: {
          slug: `${SLUG_PREFIX}-aaa`,
          nameEn: "Aaa",
          nameFa: "برند آزمایشی",
          status: "ACTIVE",
          sortOrder: null,
        },
      }),
    ]);

    const res = await GET();
    const json = await res.json();
    const ids = json.data.brands.map((b: { id: string }) => b.id);

    expect(ids.indexOf(pinnedFirst.id)).toBeLessThan(ids.indexOf(pinnedLast.id));
    // The unpinned one is alphabetically first and still comes last of the three.
    expect(ids.indexOf(pinnedLast.id)).toBeLessThan(ids.indexOf(unordered.id));
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

    expect(json.data.brands.some((b: { id: string }) => b.id === inactive.id)).toBe(false);
  });
});
