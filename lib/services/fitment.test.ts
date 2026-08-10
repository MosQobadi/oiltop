import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  combineYearSpans,
  expandYearRanges,
  groupFitmentItemsByCategory,
  selectSharedProfiles,
  type FitmentCategorySummary,
  type FitmentItemWithRelations,
} from "./fitment";

describe("expandYearRanges", () => {
  it("expands a closed range inclusively, newest first", () => {
    expect(expandYearRanges([{ yearStart: 2015, yearEnd: 2018 }])).toEqual([
      2018, 2017, 2016, 2015,
    ]);
  });

  it("expands a null yearEnd up to the current year", () => {
    expect(expandYearRanges([{ yearStart: 2022, yearEnd: null }], 2024)).toEqual([
      2024, 2023, 2022,
    ]);
  });

  it("de-duplicates overlapping engine ranges", () => {
    expect(
      expandYearRanges([
        { yearStart: 2015, yearEnd: 2017 },
        { yearStart: 2016, yearEnd: 2018 },
      ]),
    ).toEqual([2018, 2017, 2016, 2015]);
  });

  it("returns an empty list when a model has no engines", () => {
    expect(expandYearRanges([])).toEqual([]);
  });
});

const oilCategory: FitmentCategorySummary = {
  id: "cat_oil",
  nameEn: "Engine Oil",
  nameFa: "روغن موتور",
  partType: "ENGINE_OIL",
  filterKind: null,
};

const filterCategory: FitmentCategorySummary = {
  id: "cat_oil_filter",
  nameEn: "Oil Filter",
  nameFa: "فیلتر روغن",
  partType: "FILTER",
  filterKind: "OIL_FILTER",
};

// Shaped like the Prisma payload groupFitmentItemsByCategory receives.
function makeItem(overrides: Partial<FitmentItemWithRelations> = {}): FitmentItemWithRelations {
  return {
    id: "item_1",
    profileId: "profile_1",
    categoryId: oilCategory.id,
    category: oilCategory,
    climate: "STANDARD",
    productId: null,
    product: null,
    specNote: null,
    specAttributes: null,
    priority: 0,
    adminNote: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("groupFitmentItemsByCategory", () => {
  it("groups items by category, keeping first-appearance order", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({ id: "a" }),
      makeItem({ id: "b", categoryId: filterCategory.id, category: filterCategory }),
      makeItem({ id: "c" }),
    ]);

    expect(groups.map((group) => group.category.id)).toEqual([oilCategory.id, filterCategory.id]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("orders items within a category by priority", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({ id: "second", priority: 5 }),
      makeItem({ id: "first", priority: 1 }),
    ]);

    expect(groups[0].items.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("labels only the non-standard climates", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({ id: "hot", climate: "HOT" }),
      makeItem({ id: "cold", climate: "COLD" }),
      makeItem({ id: "standard" }),
    ]);

    expect(groups[0].items.map((item) => [item.climate, item.climateLabel])).toEqual([
      ["HOT", "Hot climate"],
      ["COLD", "Cold climate"],
      ["STANDARD", null],
    ]);
  });

  it("computes finalPrice from the product's discount", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({
        productId: "product_1",
        product: {
          id: "product_1",
          slug: "mobil-1-5w30",
          nameEn: "Mobil 1 5W-30",
          nameFa: "موبیل ۱ ۵W-۳۰",
          price: new Prisma.Decimal(1_000_000),
          discountPercent: 20,
          image: null,
          inventory: { stock: 40 },
        },
      }),
    ]);

    // The card the storefront renders: a PDP link, a charged price, and the
    // three-state stock signal — never the raw count.
    expect(groups[0].items[0].product).toEqual({
      id: "product_1",
      slug: "mobil-1-5w30",
      nameEn: "Mobil 1 5W-30",
      nameFa: "موبیل ۱ ۵W-۳۰",
      price: 1_000_000,
      finalPrice: 800_000,
      image: null,
      stockStatus: null,
    });
  });

  it("keeps a spec-only item's fallback fields and leaves product null", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({
        specNote: "5W-30, API SP",
        specAttributes: { viscosity: "5W-30" },
      }),
    ]);

    expect(groups[0].items[0].product).toBeNull();
    expect(groups[0].items[0].specNote).toBe("5W-30, API SP");
    expect(groups[0].items[0].specAttributes).toEqual({ viscosity: "5W-30" });
  });

  it("returns no groups for an engine with no fitment items", () => {
    expect(groupFitmentItemsByCategory([])).toEqual([]);
  });
});

describe("combineYearSpans", () => {
  it("takes the earliest start and the latest end", () => {
    expect(
      combineYearSpans([
        { yearStart: 2010, yearEnd: 2014 },
        { yearStart: 2006, yearEnd: 2012 },
      ]),
    ).toEqual({ yearStart: 2006, yearEnd: 2014 });
  });

  it("stays open when any one range is still in production", () => {
    expect(
      combineYearSpans([
        { yearStart: 2006, yearEnd: 2016 },
        { yearStart: 2017, yearEnd: null },
      ]),
    ).toEqual({ yearStart: 2006, yearEnd: null });
  });

  it("keeps the open end regardless of the order the ranges arrive in", () => {
    expect(
      combineYearSpans([
        { yearStart: 2017, yearEnd: null },
        { yearStart: 2006, yearEnd: 2016 },
      ]),
    ).toEqual({ yearStart: 2006, yearEnd: null });
  });

  it("returns a single range unchanged", () => {
    expect(combineYearSpans([{ yearStart: 2001, yearEnd: 2010 }])).toEqual({
      yearStart: 2001,
      yearEnd: 2010,
    });
  });

  it("has no span for a model with no engines", () => {
    expect(combineYearSpans([])).toBeNull();
  });
});

describe("selectSharedProfiles", () => {
  it("keeps a profile attached to more than one of the model's engines", () => {
    expect(
      selectSharedProfiles(
        [
          { profileId: "profile_a", carEngineId: "engine_1" },
          { profileId: "profile_a", carEngineId: "engine_2" },
        ],
        3,
      ),
    ).toEqual([{ profileId: "profile_a", carEngineIds: ["engine_1", "engine_2"] }]);
  });

  it("drops a profile that covers a single engine out of several", () => {
    // One engine's answer, not the model's — printing it as page copy would
    // claim a year range it doesn't cover.
    expect(selectSharedProfiles([{ profileId: "profile_a", carEngineId: "engine_1" }], 4)).toEqual(
      [],
    );
  });

  it("keeps a single-engine model's only profile", () => {
    expect(selectSharedProfiles([{ profileId: "profile_a", carEngineId: "engine_1" }], 1)).toEqual([
      { profileId: "profile_a", carEngineIds: ["engine_1"] },
    ]);
  });

  it("orders by coverage, widest first", () => {
    const selections = selectSharedProfiles(
      [
        { profileId: "narrow", carEngineId: "engine_1" },
        { profileId: "narrow", carEngineId: "engine_2" },
        { profileId: "wide", carEngineId: "engine_1" },
        { profileId: "wide", carEngineId: "engine_2" },
        { profileId: "wide", carEngineId: "engine_3" },
      ],
      3,
    );

    expect(selections.map((selection) => selection.profileId)).toEqual(["wide", "narrow"]);
  });

  it("has nothing to state for a model with no attached profiles", () => {
    expect(selectSharedProfiles([], 2)).toEqual([]);
  });
});
