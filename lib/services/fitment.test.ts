import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  expandYearRanges,
  groupFitmentItemsByCategory,
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
function makeItem(
  overrides: Partial<FitmentItemWithRelations> = {},
): FitmentItemWithRelations {
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

    expect(groups.map((group) => group.category.id)).toEqual([
      oilCategory.id,
      filterCategory.id,
    ]);
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

    expect(
      groups[0].items.map((item) => [item.climate, item.climateLabel]),
    ).toEqual([
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
          nameEn: "Mobil 1 5W-30",
          nameFa: "موبیل ۱ ۵W-۳۰",
          price: new Prisma.Decimal(1_000_000),
          discountPercent: 20,
          image: null,
        },
      }),
    ]);

    expect(groups[0].items[0].product).toEqual({
      id: "product_1",
      nameEn: "Mobil 1 5W-30",
      nameFa: "موبیل ۱ ۵W-۳۰",
      price: 1_000_000,
      finalPrice: 800_000,
      image: null,
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
