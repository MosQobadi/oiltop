import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).

const SLUG_PREFIX = "test-storefront-categories";

function categoryFixture(slug: string, nameEn: string) {
  return {
    slug,
    nameEn,
    nameFa: "دسته آزمایشی",
    shortDescriptionEn: "Short",
    shortDescriptionFa: "کوتاه",
    longDescriptionEn: "Long",
    longDescriptionFa: "بلند",
    partType: "ACCESSORY",
    status: "ACTIVE",
  } as const;
}

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

  it("exposes enough to name and link a category, and nothing else", async () => {
    const res = await GET();
    const json = await res.json();

    const airFilter = json.data.categories.find((c: { slug: string }) => c.slug === "air-filter");

    // `partType` is the fitment engine's, not the storefront's: the catalog is
    // narrowed by category, so nothing out here has any use for it.
    expect(Object.keys(airFilter).sort()).toEqual(["id", "image", "nameEn", "nameFa", "slug"]);
  });

  it("puts pinned categories first, in order, and unordered ones after them", async () => {
    // Named so alphabetical order alone would produce the exact opposite:
    // "zzz" pinned to 1 has to beat "aaa" with no position at all.
    const [pinnedLast, pinnedFirst, unordered] = await Promise.all([
      prisma.category.create({
        data: { ...categoryFixture(`${SLUG_PREFIX}-mmm`, "Mmm"), sortOrder: 2 },
      }),
      prisma.category.create({
        data: { ...categoryFixture(`${SLUG_PREFIX}-zzz`, "Zzz"), sortOrder: 1 },
      }),
      prisma.category.create({
        data: { ...categoryFixture(`${SLUG_PREFIX}-aaa`, "Aaa"), sortOrder: null },
      }),
    ]);

    const res = await GET();
    const json = await res.json();
    const ids = json.data.categories.map((c: { id: string }) => c.id);

    expect(ids.indexOf(pinnedFirst.id)).toBeLessThan(ids.indexOf(pinnedLast.id));
    // The unpinned one is alphabetically first and still comes last of the three.
    expect(ids.indexOf(pinnedLast.id)).toBeLessThan(ids.indexOf(unordered.id));
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
