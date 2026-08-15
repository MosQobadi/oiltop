import { describe, expect, it } from "vitest";
import {
  buildFitmentRequestMessage,
  climateColumnLabel,
  FIT_PARAM,
  formatCarLabel,
  formatCarName,
  formatEngineOptionLabel,
  formatSpecAttributes,
  formatSpecSummary,
  formatTypeCount,
  formatYearSpan,
  sortFitmentGroups,
  splitItemsByClimate,
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
  const group = (partType: string, slug: string) => ({ category: { partType, slug } });

  it("puts engine oil first and the filters in the design brief's order", () => {
    const sorted = sortFitmentGroups([
      group("FILTER", "cabin-filter"),
      group("FILTER", "fuel-filter"),
      group("ENGINE_OIL", "engine-oil"),
      group("FILTER", "air-filter"),
      group("FILTER", "oil-filter"),
    ]);

    expect(sorted.map((entry) => entry.category.slug)).toEqual([
      "engine-oil",
      "oil-filter",
      "air-filter",
      "cabin-filter",
      "fuel-filter",
    ]);
  });

  it("keeps a category it doesn't recognise inside its own part type", () => {
    const sorted = sortFitmentGroups([
      group("ACCESSORY", "funnels"),
      group("FILTER", "particulate-filter"),
      group("FILTER", "oil-filter"),
      group("ENGINE_OIL", "gearbox-oil"),
    ]);

    expect(sorted.map((entry) => entry.category.slug)).toEqual([
      "gearbox-oil",
      "oil-filter",
      "particulate-filter",
      "funnels",
    ]);
  });

  it("sorts on partType/slug, never on a category name", () => {
    // Two categories the fitment engine can't rank keep the order they came in.
    const first = group("OTHER", "coolant");
    const second = group("OTHER", "brake-fluid");
    expect(sortFitmentGroups([first, second])).toEqual([first, second]);
  });

  it("leaves the caller's array untouched", () => {
    const groups = [group("FILTER", "oil-filter"), group("ENGINE_OIL", "engine-oil")];
    sortFitmentGroups(groups);
    expect(groups[0].category.partType).toBe("FILTER");
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
