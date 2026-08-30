import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { listFeaturedProductBrands } from "./catalog";
import { prisma } from "@/lib/db";

// The homepage brand wall's selection rule. Run against a seeded database
// (`pnpm prisma:seed`), same as the storefront route tests.
//
// What makes this worth a test is that the rule is three conditions deep and
// each one exists for a different reason — the import is what put rows in this
// table that nobody chose to stock, and none of the three alone excludes them.

const SLUG_PREFIX = "test-featured-brands";

const slugsOf = async () => (await listFeaturedProductBrands(50)).map((brand) => brand.slug);

afterAll(async () => {
  await prisma.brand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("listFeaturedProductBrands", () => {
  it("returns the hand-entered brands the seed created", async () => {
    expect(await slugsOf()).toEqual(
      expect.arrayContaining(["mobil-1", "castrol", "bosch", "mann-filter"]),
    );
  });

  it("omits a brand the importer created", async () => {
    const imported = await prisma.brand.create({
      data: {
        slug: `${SLUG_PREFIX}-imported`,
        sourceRef: `${SLUG_PREFIX}:brand:hyundai`,
        nameEn: "Hyundai",
        nameFa: "هیوندای",
        status: "ACTIVE",
      },
    });

    expect(await slugsOf()).not.toContain(imported.slug);
  });

  // The importer's holding row for a product whose brand it couldn't read is
  // created without a `sourceRef`, so "hand-entered" alone would let it through.
  it("omits a row that carries no sourceRef but is kept out of brand lists", async () => {
    const bucket = await prisma.brand.create({
      data: {
        slug: `${SLUG_PREFIX}-bucket`,
        nameEn: "Unknown brand",
        nameFa: "برند نامشخص",
        status: "ACTIVE",
        showInBrandLists: false,
      },
    });

    expect(await slugsOf()).not.toContain(bucket.slug);
  });

  it("omits a deactivated hand-entered brand", async () => {
    const inactive = await prisma.brand.create({
      data: {
        slug: `${SLUG_PREFIX}-inactive`,
        nameEn: "Retired",
        nameFa: "بازنشسته",
        status: "INACTIVE",
      },
    });

    expect(await slugsOf()).not.toContain(inactive.slug);
  });

  it("caps the wall and lets sortOrder decide who makes the cut", async () => {
    // Named so alphabetical order would put it last of everything seeded; a
    // pin of 1 has to beat that, and a limit of 1 proves the pin is what's
    // doing the ordering rather than the name.
    const pinned = await prisma.brand.create({
      data: {
        slug: `${SLUG_PREFIX}-zzz-pinned`,
        nameEn: "Zzz Pinned",
        nameFa: "پین‌شده",
        status: "ACTIVE",
        sortOrder: 1,
      },
    });

    const top = await listFeaturedProductBrands(1);
    expect(top).toHaveLength(1);
    expect(top[0]?.slug).toBe(pinned.slug);
  });

  it("defaults to eight — two rows of the homepage grid", async () => {
    expect((await listFeaturedProductBrands()).length).toBeLessThanOrEqual(8);
  });
});
