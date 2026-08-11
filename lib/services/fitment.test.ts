import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  combineYearSpans,
  expandYearRanges,
  groupFitmentItemsByCategory,
  parseMatchSpec,
  selectSharedProfiles,
  type FitmentCategorySummary,
  type FitmentItemWithRelations,
  type FitmentProductSummary,
  type SpecMatches,
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

type FitmentItemProduct = NonNullable<FitmentItemWithRelations["product"]>;

// An ACTIVE, purchasable product by default — the status trio is what decides
// whether a customer may be recommended it (see `FitmentAudience`).
function makeProduct(overrides: Partial<FitmentItemProduct> = {}): FitmentItemProduct {
  return {
    id: "product_1",
    slug: "mobil-1-5w30",
    nameEn: "Mobil 1 5W-30",
    nameFa: "موبیل ۱ ۵W-۳۰",
    price: new Prisma.Decimal(1_000_000),
    discountPercent: 20,
    image: null,
    inventory: { stock: 40 },
    status: "ACTIVE",
    category: { status: "ACTIVE" },
    brand: { status: "ACTIVE" },
    ...overrides,
  };
}

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
    matchSpec: null,
    priority: 0,
    adminNote: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// What `resolveSpecMatches` hands the grouper: item id → the products its
// matchSpec found, already priced and ordered.
function matches(itemId: string, productIds: string[]): SpecMatches {
  const products: FitmentProductSummary[] = productIds.map((id) => ({
    id,
    slug: id,
    nameEn: id,
    nameFa: id,
    price: 500_000,
    finalPrice: 500_000,
    image: null,
    stockStatus: null,
  }));
  return new Map([[itemId, products]]);
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
      makeItem({ productId: "product_1", product: makeProduct() }),
    ]);

    // The card the storefront renders: a PDP link, a charged price, and the
    // three-state stock signal — never the raw count.
    expect(groups[0].items[0].products).toEqual([
      {
        id: "product_1",
        slug: "mobil-1-5w30",
        nameEn: "Mobil 1 5W-30",
        nameFa: "موبیل ۱ ۵W-۳۰",
        price: 1_000_000,
        finalPrice: 800_000,
        image: null,
        stockStatus: null,
      },
    ]);
  });

  it("keeps a spec-only item's fallback fields and resolves to no products", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({
        specNote: "5W-30, API SP",
        specAttributes: { viscosity: "5W-30" },
      }),
    ]);

    expect(groups[0].items[0].products).toEqual([]);
    expect(groups[0].items[0].specNote).toBe("5W-30, API SP");
    expect(groups[0].items[0].specAttributes).toEqual({ viscosity: "5W-30" });
  });

  // A product a customer can't buy must not be recommended to one. It becomes a
  // spec-only item rather than disappearing, so the requirement is still stated
  // and the "Request it" path still works — and the item's own spec fields are
  // untouched on the way through.
  it.each([
    ["the product is INACTIVE", { status: "INACTIVE" as const }],
    ["its category is INACTIVE", { category: { status: "INACTIVE" as const } }],
    ["its brand is INACTIVE", { brand: { status: "INACTIVE" as const } }],
  ])("hides a product from the public audience when %s", (_case, overrides) => {
    const groups = groupFitmentItemsByCategory([
      makeItem({
        productId: "product_1",
        product: makeProduct(overrides),
        specNote: "5W-30, API SP",
      }),
    ]);

    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].products).toEqual([]);
    expect(groups[0].items[0].specNote).toBe("5W-30, API SP");
  });

  it("defaults to the public audience when none is given", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({ productId: "product_1", product: makeProduct({ status: "INACTIVE" }) }),
    ]);

    expect(groups[0].items[0].products).toEqual([]);
  });

  // The admin Fitment Preview is the QA tool for this data: hiding the product
  // there would hide the problem an admin is looking at that screen to find.
  it("keeps a deactivated product for the admin audience", () => {
    const groups = groupFitmentItemsByCategory(
      [makeItem({ productId: "product_1", product: makeProduct({ status: "INACTIVE" }) })],
      "admin",
    );

    expect(groups[0].items[0].products.map((product) => product.id)).toEqual(["product_1"]);
  });

  // The status trio decides visibility; it is never part of the payload.
  it("never publishes the status fields it decides visibility on", () => {
    const groups = groupFitmentItemsByCategory([
      makeItem({ productId: "product_1", product: makeProduct() }),
    ]);

    expect(groups[0].items[0].products[0]).not.toHaveProperty("status");
    expect(groups[0].items[0].products[0]).not.toHaveProperty("category");
    expect(groups[0].items[0].products[0]).not.toHaveProperty("brand");
  });

  it("returns no groups for an engine with no fitment items", () => {
    expect(groupFitmentItemsByCategory([])).toEqual([]);
  });

  // --- matchSpec ---
  //
  // The query itself belongs to `resolveSpecMatches` (it reads the catalog);
  // what's checked here is the precedence a resolved item applies to it.

  it("resolves a spec-based item to the products its matchSpec found", () => {
    const groups = groupFitmentItemsByCategory(
      [makeItem({ matchSpec: { viscosity: "5W-30" } })],
      "public",
      matches("item_1", ["cheap", "dearer"]),
    );

    expect(groups[0].items[0].products.map((product) => product.id)).toEqual(["cheap", "dearer"]);
  });

  // Pinning a product is how an admin overrides the query, so it has to win —
  // otherwise adding a spec to an item would quietly unpin it.
  it("prefers the explicit product over a matchSpec on the same item", () => {
    const groups = groupFitmentItemsByCategory(
      [
        makeItem({
          productId: "product_1",
          product: makeProduct(),
          matchSpec: { viscosity: "5W-30" },
        }),
      ],
      "public",
      matches("item_1", ["matched"]),
    );

    expect(groups[0].items[0].products.map((product) => product.id)).toEqual(["product_1"]);
  });

  // The case the column exists for: the shop stopped stocking the one oil this
  // recommendation was pinned to, and the spec beside it still answers. The
  // linked product is unusable here, so there is nothing to prefer it over.
  it("falls through to the matchSpec when the linked product was deactivated", () => {
    const groups = groupFitmentItemsByCategory(
      [
        makeItem({
          productId: "product_1",
          product: makeProduct({ status: "INACTIVE" }),
          matchSpec: { viscosity: "5W-30" },
        }),
      ],
      "public",
      matches("item_1", ["still_stocked"]),
    );

    expect(groups[0].items[0].products.map((product) => product.id)).toEqual(["still_stocked"]);
  });

  // A spec that matches nothing is the spec-only case: the customer still gets
  // an answer, and SpecOnlyCard still captures the lead.
  it("falls back to the spec-only card when a matchSpec resolves to nothing", () => {
    const groups = groupFitmentItemsByCategory(
      [makeItem({ matchSpec: { viscosity: "0W-8" }, specNote: "0W-8, API SP" })],
      "public",
      matches("item_1", []),
    );

    expect(groups[0].items[0].products).toEqual([]);
    expect(groups[0].items[0].specNote).toBe("0W-8, API SP");
  });
});

// `matchSpec` is a free-form Json column, so the parser is what stands between
// whatever the importer wrote and a query.
describe("parseMatchSpec", () => {
  it("reads the documented shape", () => {
    expect(parseMatchSpec({ viscosity: "5W-30", apiGrade: "SN", volumeMl: 4000 })).toEqual({
      viscosity: "5W-30",
      apiGrade: "SN",
      volumeMl: 4000,
    });
  });

  // Product.viscosity/apiGrade are stored uppercase, so a lowercase spec would
  // match nothing at all rather than matching loosely.
  it("uppercases the codes it will match on", () => {
    expect(parseMatchSpec({ viscosity: " 5w-30 ", apiGrade: "sn" })).toEqual({
      viscosity: "5W-30",
      apiGrade: "SN",
    });
  });

  it("keeps a partial spec — an absent key is not a constraint", () => {
    expect(parseMatchSpec({ viscosity: "10W-40" })).toEqual({ viscosity: "10W-40" });
  });

  it("drops keys of the wrong type", () => {
    expect(parseMatchSpec({ viscosity: 530, apiGrade: "SN", volumeMl: "4000" })).toEqual({
      apiGrade: "SN",
    });
  });

  it("rejects a volume that isn't a positive whole number of millilitres", () => {
    expect(parseMatchSpec({ volumeMl: 0 })).toBeNull();
    expect(parseMatchSpec({ volumeMl: -1 })).toBeNull();
    expect(parseMatchSpec({ volumeMl: 4000.5 })).toBeNull();
  });

  // Matching on nothing would return the whole category, which is not an
  // answer — so "no usable key" has to read as "no spec".
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["an array", ["5W-30"]],
    ["a bare string", "5W-30"],
    ["blank codes", { viscosity: "  ", apiGrade: "" }],
  ])("has no spec for %s", (_case, value) => {
    expect(parseMatchSpec(value as Prisma.JsonValue)).toBeNull();
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
