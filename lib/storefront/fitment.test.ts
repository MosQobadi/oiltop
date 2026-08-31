import { describe, expect, it } from "vitest";
import {
  buildFitmentRequestMessage,
  climateColumnLabel,
  FIT_PARAM,
  formatCarLabel,
  formatCarName,
  formatDisplacement,
  formatEngineOptionLabel,
  formatFuelType,
  formatSpecAttributes,
  formatSpecSummary,
  formatTypeCount,
  formatYearSpan,
  clipFitmentItems,
  deriveClimateByViscosity,
  partitionFitmentGroups,
  sortFitmentGroups,
  splitItemsByClimate,
  winterGrade,
  variantImage,
  withFitContext,
} from "./fitment";

describe("withFitContext", () => {
  it("starts a query string when the href has none", () => {
    expect(withFitContext("/en/fitment", "eng_1")).toBe("/en/fitment?fit=eng_1");
  });

  it("appends to an href that already carries params", () => {
    expect(withFitContext("/en/products?page=2", "eng_1")).toBe("/en/products?page=2&fit=eng_1");
  });

  it("encodes the id rather than trusting it to be URL-safe", () => {
    expect(withFitContext("/en/fitment", "a b&c")).toBe("/en/fitment?fit=a%20b%26c");
  });

  it("uses the exported param name, so readers and writers can't drift", () => {
    expect(withFitContext("/en/fitment", "eng_1")).toContain(`${FIT_PARAM}=`);
  });
});

describe("formatYearSpan", () => {
  it("writes a closed range in the reader's digits", () => {
    expect(formatYearSpan("en", { yearStart: 2001, yearEnd: 2010 })).toBe("2001–2010");
    expect(formatYearSpan("fa", { yearStart: 2001, yearEnd: 2010 })).toBe("۲۰۰۱–۲۰۱۰");
  });

  it("reads a null yearEnd as still in production, not as unknown", () => {
    expect(formatYearSpan("en", { yearStart: 2011, yearEnd: null })).toBe("2011–Present");
    expect(formatYearSpan("fa", { yearStart: 2011, yearEnd: null })).toBe("۲۰۱۱–تاکنون");
  });
});

describe("formatTypeCount", () => {
  it("counts types, not engines, in the reader's digits", () => {
    expect(formatTypeCount("en", 4)).toBe("4 types");
    expect(formatTypeCount("fa", 4)).toBe("۴ تیپ");
  });

  it("has a singular only in English — Persian doesn't inflect for plural", () => {
    expect(formatTypeCount("en", 1)).toBe("1 type");
    expect(formatTypeCount("fa", 1)).toBe("۱ تیپ");
  });
});

describe("variantImage", () => {
  it("prefers the type's own photo", () => {
    expect(variantImage({ image: "/type-2.jpg" }, { image: "/206.jpg" })).toBe("/type-2.jpg");
  });

  it("falls back to the model's when the type has none", () => {
    expect(variantImage({ image: null }, { image: "/206.jpg" })).toBe("/206.jpg");
  });

  it("returns null only when neither has one", () => {
    expect(variantImage({ image: null }, { image: null })).toBeNull();
  });

  it("tolerates a missing model, for callers that only hold the type", () => {
    expect(variantImage({ image: "/type-2.jpg" }, null)).toBe("/type-2.jpg");
    expect(variantImage({ image: null }, undefined)).toBeNull();
  });
});

describe("formatFuelType", () => {
  it("writes the enum as a customer reads it, in either tree", () => {
    expect(formatFuelType("en", "PETROL")).toBe("Petrol");
    expect(formatFuelType("fa", "PETROL")).toBe("بنزینی");
    expect(formatFuelType("fa", "LPG_CNG")).toBe("دوگانه‌سوز");
  });

  it("shows an unknown value as itself rather than dropping it", () => {
    expect(formatFuelType("en", "HYDROGEN")).toBe("HYDROGEN");
  });
});

describe("formatDisplacement", () => {
  it("states cubic centimetres as the litre figure on the boot lid", () => {
    expect(formatDisplacement("en", 1598)).toBe("1.6L");
    expect(formatDisplacement("fa", 1598)).toBe("۱٫۶ لیتر");
  });

  it("keeps one decimal place, so 2000cc is 2.0L and not 2L", () => {
    expect(formatDisplacement("en", 2000)).toBe("2.0L");
  });
});

describe("formatEngineOptionLabel", () => {
  const engine = {
    labelEn: "1.4L TU3 Petrol",
    labelFa: "۱٫۴ لیتر TU3 بنزینی",
    yearStart: 2001,
    yearEnd: 2010,
  };

  it("pairs the engine label with its year range", () => {
    expect(formatEngineOptionLabel("en", engine)).toBe("1.4L TU3 Petrol (2001–2010)");
  });

  it("renders the Persian label and Persian digits on the fa tree", () => {
    expect(formatEngineOptionLabel("fa", engine)).toBe("۱٫۴ لیتر TU3 بنزینی (۲۰۰۱–۲۰۱۰)");
  });

  it("reads a null yearEnd as still in production, not as unknown", () => {
    expect(formatEngineOptionLabel("en", { ...engine, yearEnd: null })).toBe(
      "1.4L TU3 Petrol (2001–Present)",
    );
    expect(formatEngineOptionLabel("fa", { ...engine, yearEnd: null })).toContain("تاکنون");
  });

  it("falls back to the English label when the Persian one is blank", () => {
    expect(formatEngineOptionLabel("fa", { ...engine, labelFa: "  " })).toBe(
      "1.4L TU3 Petrol (۲۰۰۱–۲۰۱۰)",
    );
  });
});

const car = {
  carBrand: { nameEn: "Peugeot", nameFa: "پژو" },
  carModel: { nameEn: "206", nameFa: "۲۰۶" },
  carEngine: {
    labelEn: "1.4L TU3 Petrol",
    labelFa: "۱٫۴ لیتر TU3 بنزینی",
    yearStart: 2001,
    yearEnd: 2010,
  },
};

describe("formatCarName / formatCarLabel", () => {
  it("names the car the way a customer does, brand then model", () => {
    expect(formatCarName("en", car)).toBe("Peugeot 206");
    expect(formatCarName("fa", car)).toBe("پژو ۲۰۶");
  });

  it("adds the engine when the whole car has to fit on one line", () => {
    expect(formatCarLabel("en", car)).toBe("Peugeot 206 · 1.4L TU3 Petrol (2001–2010)");
  });
});

describe("sortFitmentGroups", () => {
  const group = (partType: string, slug: string, sortOrder: number | null = null) => ({
    category: { partType, slug, sortOrder },
  });

  it("puts the six primary categories first, in the order the results page states them", () => {
    const sorted = sortFitmentGroups([
      group("FILTER", "cabin-filter", 4),
      group("FILTER", "fuel-filter", 6),
      group("ENGINE_OIL", "engine-oil", 1),
      group("FILTER", "air-filter", 5),
      group("ENGINE_OIL", "gearbox-oil", 2),
      group("FILTER", "oil-filter", 3),
    ]);

    expect(sorted.map((entry) => entry.category.slug)).toEqual([
      "engine-oil",
      "gearbox-oil",
      "oil-filter",
      "cabin-filter",
      "air-filter",
      "fuel-filter",
    ]);
  });

  it("puts every other category after all six, whatever its sortOrder says", () => {
    // brake-pads is numbered ahead of fuel-filter here and still sorts behind it:
    // the six are a product decision the admin's running order doesn't outrank.
    const sorted = sortFitmentGroups([
      group("OTHER", "brake-pads", 2),
      group("FILTER", "fuel-filter", 90),
    ]);

    expect(sorted.map((entry) => entry.category.slug)).toEqual(["fuel-filter", "brake-pads"]);
  });

  it("orders the secondary band by part type, accessories last", () => {
    const sorted = sortFitmentGroups([
      group("ACCESSORY", "air-freshener", 22),
      group("OTHER", "brake-pads", 11),
      group("FILTER", "gearbox-filter", 10),
      group("ENGINE_OIL", "two-stroke-oil", 30),
    ]);

    expect(sorted.map((entry) => entry.category.slug)).toEqual([
      "two-stroke-oil",
      "gearbox-filter",
      "brake-pads",
      "air-freshener",
    ]);
  });

  it("orders a part type's own categories by the admin's sortOrder, unnumbered last", () => {
    const sorted = sortFitmentGroups([
      group("OTHER", "grease", null),
      group("OTHER", "coolant", 13),
      group("OTHER", "brake-pads", 11),
    ]);

    expect(sorted.map((entry) => entry.category.slug)).toEqual(["brake-pads", "coolant", "grease"]);
  });

  it("sorts on partType/slug/sortOrder, never on a category name", () => {
    // Two secondary categories tied on everything rankable keep the order they
    // came in — the service's, not an alphabetical one.
    const first = group("OTHER", "coolant", 13);
    const second = group("OTHER", "brake-fluid", 13);
    expect(sortFitmentGroups([first, second])).toEqual([first, second]);
  });

  it("leaves the caller's array untouched", () => {
    const groups = [group("FILTER", "oil-filter", 3), group("ENGINE_OIL", "engine-oil", 1)];
    sortFitmentGroups(groups);
    expect(groups[0].category.partType).toBe("FILTER");
  });
});

describe("partitionFitmentGroups", () => {
  const group = (partType: string, slug: string, sortOrder: number | null = null) => ({
    category: { partType, slug, sortOrder },
  });

  it("splits the six from everything else, each side sorted", () => {
    const { primary, secondary } = partitionFitmentGroups([
      group("ACCESSORY", "air-freshener", 22),
      group("FILTER", "oil-filter", 3),
      group("OTHER", "coolant", 13),
      group("ENGINE_OIL", "engine-oil", 1),
    ]);

    expect(primary.map((entry) => entry.category.slug)).toEqual(["engine-oil", "oil-filter"]);
    expect(secondary.map((entry) => entry.category.slug)).toEqual(["coolant", "air-freshener"]);
  });

  it("has no primary zone for a car that only resolved to accessories", () => {
    const { primary, secondary } = partitionFitmentGroups([
      group("ACCESSORY", "air-freshener", 22),
    ]);
    expect(primary).toEqual([]);
    expect(secondary).toHaveLength(1);
  });

  it("drops the importer's holding shelf from both zones", () => {
    // "Uncategorised (imported)" is a review queue, not a heading a customer
    // reads. Its products stay in the catalog; they just aren't a section here.
    const { primary, secondary } = partitionFitmentGroups([
      group("ENGINE_OIL", "engine-oil", 1),
      group("OTHER", "imported-uncategorised", null),
    ]);

    expect(primary.map((entry) => entry.category.slug)).toEqual(["engine-oil"]);
    expect(secondary).toEqual([]);
  });
});

describe("clipFitmentItems", () => {
  const item = (id: string, productCount = 1) => ({
    id,
    products: Array.from({ length: productCount }, (_, index) => ({ id: `${id}:${index}` })),
  });

  it("keeps four cards and reports how many there really were", () => {
    const clipped = clipFitmentItems([item("a"), item("b"), item("c"), item("d"), item("e")], 4);

    expect(clipped.items.map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
    expect(clipped.total).toBe(5);
  });

  it("counts a spec-based item's matches as the cards they are", () => {
    // One item resolving to three products is three cards, so only one more fits.
    const clipped = clipFitmentItems([item("spec", 3), item("b"), item("c")], 4);

    expect(clipped.items.map((entry) => entry.id)).toEqual(["spec", "b"]);
    expect(clipped.total).toBe(5);
  });

  it("keeps the first item even when it alone exceeds the limit", () => {
    // Rendering nothing would read as "we have nothing for your car".
    const clipped = clipFitmentItems([item("spec", 9)], 4);
    expect(clipped.items).toHaveLength(1);
    expect(clipped.total).toBe(9);
  });

  it("counts a spec-only item with no products as one card", () => {
    const clipped = clipFitmentItems([{ id: "spec-only", products: [] }], 4);
    expect(clipped.total).toBe(1);
  });

  it("reports nothing clipped when the section already fits", () => {
    const items = [item("a"), item("b")];
    const clipped = clipFitmentItems(items, 4);
    expect(clipped.items).toEqual(items);
    expect(clipped.total).toBe(2);
  });
});

describe("winterGrade", () => {
  it("reads the cold-start half of a multigrade", () => {
    expect(winterGrade("5W-40")).toBe(5);
    expect(winterGrade("10W40")).toBe(10);
    expect(winterGrade("0W-20")).toBe(0);
  });

  it("is null for a monograde, for prose and for no viscosity at all", () => {
    expect(winterGrade("40")).toBeNull();
    expect(winterGrade("synthetic")).toBeNull();
    expect(winterGrade(null)).toBeNull();
    expect(winterGrade(undefined)).toBeNull();
  });
});

describe("deriveClimateByViscosity", () => {
  const oil = (id: string, viscosity: string | null) => ({
    id,
    climate: "STANDARD" as const,
    products: [{ viscosity }],
  });

  it("splits an all-standard section on the winter grade", () => {
    const placed = deriveClimateByViscosity([
      oil("a", "10W-40"),
      oil("b", "5W-40"),
      oil("c", "0W-20"),
    ]);

    expect(placed?.map((item) => [item.id, item.climate])).toEqual([
      ["a", "HOT"],
      ["b", "COLD"],
      ["c", "COLD"],
    ]);
  });

  it("never second-guesses a climate an admin authored", () => {
    const authored = [
      { id: "a", climate: "HOT" as const, products: [{ viscosity: "10W-40" }] },
      { id: "b", climate: "STANDARD" as const, products: [{ viscosity: "5W-40" }] },
    ];
    expect(deriveClimateByViscosity(authored)).toBeNull();
  });

  it("leaves one grade alone — a single answer is not a choice of climate", () => {
    expect(deriveClimateByViscosity([oil("a", "10W-40"), oil("b", "10W-30")])).toBeNull();
  });

  it("leaves the section flat when any oil has no grade to place it by", () => {
    // Dropping the unplaceable one would silently shorten the recommendation.
    expect(deriveClimateByViscosity([oil("a", "10W-40"), oil("b", "5W-40"), oil("c", null)])).toBe(
      null,
    );
  });

  it("has nothing to split in an empty section", () => {
    expect(deriveClimateByViscosity([])).toBeNull();
  });

  it("leaves the caller's items untouched", () => {
    const items = [oil("a", "10W-40"), oil("b", "5W-40")];
    deriveClimateByViscosity(items);
    expect(items[0].climate).toBe("STANDARD");
  });
});

describe("splitItemsByClimate", () => {
  it("separates the hot/cold pair from the standard items", () => {
    const items = [
      { id: "a", climate: "STANDARD" as const },
      { id: "b", climate: "HOT" as const },
      { id: "c", climate: "COLD" as const },
      { id: "d", climate: "STANDARD" as const },
    ];
    const split = splitItemsByClimate(items);

    expect(split.standard.map((item) => item.id)).toEqual(["a", "d"]);
    expect(split.hot.map((item) => item.id)).toEqual(["b"]);
    expect(split.cold.map((item) => item.id)).toEqual(["c"]);
  });

  it("keeps every co-equal item of a climate, not just the first", () => {
    const split = splitItemsByClimate([
      { id: "a", climate: "HOT" as const },
      { id: "b", climate: "HOT" as const },
    ]);
    expect(split.hot).toHaveLength(2);
  });
});

describe("climateColumnLabel", () => {
  it("labels both columns as climates, not as a ranking", () => {
    expect(climateColumnLabel("en", "HOT")).toBe("For hot climates");
    expect(climateColumnLabel("en", "COLD")).toBe("For cold climates");
    expect(climateColumnLabel("fa", "HOT")).toBe("برای اقلیم گرم");
  });
});

describe("formatSpecAttributes", () => {
  it("turns the Json column into readable rows", () => {
    expect(
      formatSpecAttributes({ viscosity: "5W-30 or 10W-40", apiRating: "API SL or newer" }),
    ).toEqual([
      { label: "Viscosity", value: "5W-30 or 10W-40" },
      { label: "Api Rating", value: "API SL or newer" },
    ]);
  });

  it("renders numbers, booleans and lists, and drops what has no one-line form", () => {
    expect(
      formatSpecAttributes({
        capacityLitres: 4.2,
        approved: true,
        standards: ["API SP", "ILSAC GF-6"],
        nested: { a: 1 },
        missing: null,
        blank: "   ",
      }),
    ).toEqual([
      { label: "Capacity Litres", value: "4.2" },
      { label: "Approved", value: "true" },
      { label: "Standards", value: "API SP, ILSAC GF-6" },
    ]);
  });

  it("proves the shape rather than trusting the Json column", () => {
    expect(formatSpecAttributes(null)).toEqual([]);
    expect(formatSpecAttributes("5W-30")).toEqual([]);
    expect(formatSpecAttributes(["5W-30"])).toEqual([]);
  });
});

describe("formatSpecSummary", () => {
  it("joins the spec attributes into one line", () => {
    expect(
      formatSpecSummary({
        specNote: "ignored when attributes exist",
        specAttributes: { viscosity: "5W-30", apiRating: "API SP" },
      }),
    ).toBe("5W-30, API SP");
  });

  it("falls back to the admin's free-text note", () => {
    expect(formatSpecSummary({ specNote: "  Standard spin-on filter  ", specAttributes: {} })).toBe(
      "Standard spin-on filter",
    );
  });

  it("has nothing to say when neither is filled in", () => {
    expect(formatSpecSummary({ specNote: null, specAttributes: null })).toBeNull();
    expect(formatSpecSummary({ specNote: "   ", specAttributes: null })).toBeNull();
  });
});

describe("buildFitmentRequestMessage", () => {
  const carLabel = formatCarLabel("en", car);

  it("writes the spec from the attributes when there are any", () => {
    expect(
      buildFitmentRequestMessage("en", {
        carLabel,
        categoryName: "Engine Oil",
        specNote: "ignored when attributes exist",
        specAttributes: { viscosity: "5W-30", apiRating: "API SP" },
      }),
    ).toBe("Looking for: 5W-30, API SP — Engine Oil for Peugeot 206 · 1.4L TU3 Petrol (2001–2010)");
  });

  it("falls back to the admin's free-text note", () => {
    expect(
      buildFitmentRequestMessage("en", {
        carLabel,
        categoryName: "Oil Filter",
        specNote: "Standard spin-on filter",
        specAttributes: null,
      }),
    ).toContain("Looking for: Standard spin-on filter — Oil Filter for");
  });

  it("names what's being asked for when there is no category and no spec", () => {
    expect(
      buildFitmentRequestMessage("en", {
        carLabel,
        categoryName: null,
        specNote: null,
        specAttributes: null,
      }),
    ).toBe("Looking for: Parts for Peugeot 206 · 1.4L TU3 Petrol (2001–2010)");
  });
});
