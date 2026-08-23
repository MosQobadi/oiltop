import { describe, expect, it } from "vitest";
import {
  brandLabelDisagrees,
  deriveSku,
  deriveSlug,
  discountPercentFrom,
  fallbackSlug,
  fitmentCandidatesFor,
  fitmentHash,
  fitmentProfileLabel,
  fitmentSpecNote,
  importHashNote,
  isImportHashNote,
  DEFAULT_FUEL_TYPE,
  mapFuelType,
  normaliseForMatch,
  parseApiGrade,
  parseProductSpecs,
  parseViscosity,
  parseVolumeMl,
  sourceRefFor,
  sourceSlugFromUrl,
  toLatinDigits,
  truncate,
  type CanonicalFitmentRow,
  type FitmentCandidate,
} from "./import";
import type { ScrapeCar, ScrapeCarSection } from "./validation/import";

describe("toLatinDigits", () => {
  it("converts Persian and Arabic-Indic digits", () => {
    expect(toLatinDigits("۱,۴۵۰,۰۰۰ تومان")).toBe("1,450,000 تومان");
    expect(toLatinDigits("٤ لیتر")).toBe("4 لیتر");
  });

  it("leaves Latin digits and text alone", () => {
    expect(toLatinDigits("5W30")).toBe("5W30");
  });
});

describe("normaliseForMatch", () => {
  it("folds ZWNJ, Arabic yeh/kaf and repeated spaces", () => {
    expect(normaliseForMatch("درجه  گرانروی")).toBe(normaliseForMatch("درجه گرانروی"));
    expect(normaliseForMatch("كیفیت")).toBe(normaliseForMatch("کیفیت"));
    expect(normaliseForMatch("خنک‌کننده")).toBe("خنک کننده");
  });
});

describe("sourceRefFor", () => {
  it("formats <source>:<kind>/<key>", () => {
    expect(sourceRefFor("oil-city", "product", "toyota-5w30-4l")).toBe(
      "oil-city:product/toyota-5w30-4l",
    );
    expect(sourceRefFor("oil-city", "car-model", "تویوتا", "تویوتا CHR")).toBe(
      "oil-city:car-model/تویوتا/تویوتا CHR",
    );
  });

  // A stray space in the source would otherwise mint a second ref for the same
  // record and re-import it as a duplicate row.
  it("collapses whitespace in the key so one record has one ref", () => {
    expect(sourceRefFor("oil-city", "brand", "  لکسوس  ")).toBe(
      sourceRefFor("oil-city", "brand", "لکسوس"),
    );
  });
});

describe("deriveSlug", () => {
  const sourceRef = "oil-city:product/toyota-motor-oil-5w30-sn-4l";

  it("keeps a Latin source slug", () => {
    expect(
      deriveSlug({ sourceSlug: "toyota-motor-oil-5w30-sn-4l", sourceRef, prefix: "product" }),
    ).toBe("toyota-motor-oil-5w30-sn-4l");
  });

  it("falls back to the sourceRef hash for a Persian slug", () => {
    const slug = deriveSlug({
      sourceSlug: "فیلتر-روغن-تویوتا-سی-اچ-آر",
      sourceRef,
      prefix: "product",
    });
    expect(slug).toBe(fallbackSlug("product", sourceRef));
    expect(slug).toMatch(/^product-[0-9a-f]{10}$/);
  });

  it("falls back when only a fragment of Latin survives", () => {
    expect(deriveSlug({ sourceSlug: "فیلتر-x", sourceRef, prefix: "product" })).toBe(
      fallbackSlug("product", sourceRef),
    );
  });

  it("falls back when there is no source slug at all", () => {
    expect(deriveSlug({ sourceSlug: null, sourceRef, prefix: "car-model" })).toBe(
      fallbackSlug("car-model", sourceRef),
    );
  });

  // The whole point of hashing the ref rather than counting rows: the same
  // record has to land on the same slug on every run, on every machine.
  it("is stable for the same record and different across records", () => {
    const first = deriveSlug({ sourceSlug: null, sourceRef, prefix: "product" });
    const second = deriveSlug({ sourceSlug: null, sourceRef, prefix: "product" });
    const other = deriveSlug({
      sourceSlug: null,
      sourceRef: "oil-city:product/something-else",
      prefix: "product",
    });
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });
});

describe("deriveSku", () => {
  it("is prefixed with the source and stable per record", () => {
    const sku = deriveSku("oil-city", "oil-city:product/toyota-5w30");
    expect(sku).toMatch(/^OILCITY-[0-9A-F]{10}$/);
    expect(deriveSku("oil-city", "oil-city:product/toyota-5w30")).toBe(sku);
  });
});

describe("parseVolumeMl", () => {
  it("reads litres and millilitres, in either digit set", () => {
    expect(parseVolumeMl("4 لیتر")).toBe(4000);
    expect(parseVolumeMl("۵ لیتر")).toBe(5000);
    expect(parseVolumeMl("4.2 لیتر")).toBe(4200);
    expect(parseVolumeMl("۵۰۰ میلی لیتر")).toBe(500);
    expect(parseVolumeMl("500 ml")).toBe(500);
  });

  it("does not read 'میلی لیتر' as 'لیتر'", () => {
    expect(parseVolumeMl("۵۰۰ میلی‌لیتر")).toBe(500);
  });

  it("returns null for a unit it doesn't know or nonsense", () => {
    expect(parseVolumeMl("1 گالن")).toBeNull();
    expect(parseVolumeMl("مناسب موتورهای بنزینی")).toBeNull();
    expect(parseVolumeMl("0 لیتر")).toBeNull();
  });
});

describe("parseViscosity", () => {
  it("normalises to the form the column stores", () => {
    expect(parseViscosity("5W30")).toBe("5W30");
    expect(parseViscosity("5w-30")).toBe("5W-30");
    expect(parseViscosity("۱۰W۴۰")).toBe("10W40");
    expect(parseViscosity("SAE 40")).toBe("40");
  });

  it("drops prose rather than storing it in a filtered column", () => {
    expect(parseViscosity("مناسب هر چهار فصل")).toBeNull();
    expect(parseViscosity("")).toBeNull();
  });
});

describe("parseApiGrade", () => {
  it("stores the grade, not the word API", () => {
    expect(parseApiGrade("SN")).toBe("SN");
    expect(parseApiGrade("API SN")).toBe("SN");
    expect(parseApiGrade("sl/cf")).toBe("SL/CF");
  });

  it("returns null for Persian prose", () => {
    expect(parseApiGrade("کیفیت بالا")).toBeNull();
  });
});

describe("parseProductSpecs", () => {
  it("fills the three columns from the source's badges", () => {
    expect(parseProductSpecs({ "درجه گرانروی": "5W30", کیفیت: "SN", حجم: "4 لیتر" })).toEqual({
      viscosity: "5W30",
      apiGrade: "SN",
      volumeMl: 4000,
    });
  });

  it("leaves a column null rather than guessing at an unknown key", () => {
    expect(parseProductSpecs({ رنگ: "صورتی" })).toEqual({
      viscosity: null,
      apiGrade: null,
      volumeMl: null,
    });
    expect(parseProductSpecs({})).toEqual({ viscosity: null, apiGrade: null, volumeMl: null });
  });
});

describe("discountPercentFrom", () => {
  it("rounds the difference between the two printed figures", () => {
    expect(discountPercentFrom(1_450_000, 1_780_000)).toBe(19);
    expect(discountPercentFrom(900_000, 1_000_000)).toBe(10);
  });

  it("is zero without a higher original price", () => {
    expect(discountPercentFrom(320_000, null)).toBe(0);
    expect(discountPercentFrom(320_000, 320_000)).toBe(0);
    expect(discountPercentFrom(320_000, 300_000)).toBe(0);
    expect(discountPercentFrom(null, 300_000)).toBe(0);
  });
});

describe("mapFuelType", () => {
  it("reads the source's own wording", () => {
    expect(mapFuelType("1800cc هیبرید", null)?.fuelType).toBe("HYBRID");
    expect(mapFuelType(null, "پژو 405 بنزینی")?.fuelType).toBe("PETROL");
    expect(mapFuelType("دیزل", null)?.fuelType).toBe("DIESEL");
    expect(mapFuelType("تمام برقی", null)?.fuelType).toBe("ELECTRIC");
  });

  // A hybrid's title says "بنزینی هیبرید" and a dual-fuel car's says
  // "دوگانه سوز بنزین/گاز" — the specific terms have to win over "بنزین".
  it("prefers the more specific term", () => {
    expect(mapFuelType("بنزینی هیبرید", null)?.fuelType).toBe("HYBRID");
    expect(mapFuelType("دوگانه سوز بنزین و گاز", null)?.fuelType).toBe("LPG_CNG");
  });

  // Null is "the page did not say", which the caller turns into
  // DEFAULT_FUEL_TYPE — the distinction is kept here so the report can separate
  // what the source stated from what we assumed.
  it("returns null when the wording says nothing about fuel", () => {
    expect(mapFuelType("تویوتا CHR", null)).toBeNull();
    expect(mapFuelType("هایلوکس 2005-2013", null)).toBeNull();
    expect(mapFuelType(null, null)).toBeNull();
  });

  it("still wins over the default when the wording is explicit", () => {
    // The Toyota pages say "هیبرید" on a dozen models. Flattening those to the
    // market default would discard something the source actually told us.
    expect(mapFuelType(null, "کمری هیبرید 2023-2025 موتور 2000")?.fuelType).toBe("HYBRID");
    expect(DEFAULT_FUEL_TYPE).toBe("PETROL");
  });
});

describe("brandLabelDisagrees", () => {
  it("flags a label the title doesn't carry", () => {
    expect(brandLabelDisagrees("روغن موتور تویوتا 5W30", "لکسوس")).toBe(true);
  });

  it("stays quiet when the title carries the label or there is nothing to compare", () => {
    expect(brandLabelDisagrees("روغن موتور تویوتا 5W30", "تویوتا")).toBe(false);
    expect(brandLabelDisagrees("فیلتر روغن", null)).toBe(false);
    expect(brandLabelDisagrees(null, "تویوتا")).toBe(false);
  });
});

describe("truncate", () => {
  it("keeps imported rows editable in the admin form", () => {
    expect(truncate("a".repeat(600), 500)).toHaveLength(500);
    expect(truncate("short", 500)).toBe("short");
  });
});

describe("sourceSlugFromUrl", () => {
  // The extractor writes sourceSlug as the URL's last path segment decoded, so
  // this has to land on exactly the same string or a section never finds its
  // product. Both halves of the real fixture pair are here.
  it("decodes the last path segment into the product's natural key", () => {
    expect(sourceSlugFromUrl("https://www.oil-city.ir/product/toyota-motor-oil-5w30-sn-4l/")).toBe(
      "toyota-motor-oil-5w30-sn-4l",
    );
    expect(
      sourceSlugFromUrl(
        "https://www.oil-city.ir/product/%D9%81%DB%8C%D9%84%D8%AA%D8%B1-%D8%B1%D9%88%D8%BA%D9%86-%D8%AA%D9%88%DB%8C%D9%88%D8%AA%D8%A7-%D8%B3%DB%8C-%D8%A7%DA%86-%D8%A2%D8%B1/",
      ),
    ).toBe("فیلتر-روغن-تویوتا-سی-اچ-آر");
  });

  it("ignores a missing trailing slash, a query and a fragment", () => {
    expect(sourceSlugFromUrl("https://www.oil-city.ir/product/toyota-5w30")).toBe("toyota-5w30");
    expect(sourceSlugFromUrl("https://www.oil-city.ir/product/toyota-5w30/?utm=x#buy")).toBe(
      "toyota-5w30",
    );
  });

  it("is null for anything it can't read a key out of", () => {
    expect(sourceSlugFromUrl("not a url")).toBeNull();
    expect(sourceSlugFromUrl("https://www.oil-city.ir/")).toBeNull();
    // A malformed percent-escape: the raw segment isn't the key either.
    expect(sourceSlugFromUrl("https://www.oil-city.ir/product/%E0%A4%A/")).toBeNull();
  });
});

function makeSection(overrides: Partial<ScrapeCarSection> = {}): ScrapeCarSection {
  return {
    headingFa: "روغن موتور خودرو",
    categoryGuess: "engine-oil",
    capacityText: null,
    specNoteFa: null,
    products: [],
    ...overrides,
  };
}

function makeCar(sections: ScrapeCarSection[]): ScrapeCar {
  return {
    brandNameFa: "تویوتا",
    brandSourceSlug: "toyota",
    modelNameFa: "تویوتا CHR",
    modelSourceSlug: "chr",
    modelDescriptorText: "1800cc هیبرید",
    sourceUrl: "https://www.oil-city.ir/car/toyota/chr/",
    sections,
  };
}

describe("fitmentCandidatesFor", () => {
  it("emits one candidate per named product, in page order", () => {
    const candidates = fitmentCandidatesFor(
      makeCar([
        makeSection({
          specNoteFa: "نکته : گرانروی پیشنهادی 5W30",
          products: [
            {
              nameFa: "روغن موتور تویوتا",
              productSourceUrl: "https://www.oil-city.ir/product/toyota-5w30/",
              orderOnPage: 0,
            },
            { nameFa: "روغن موتور موبیل 1", productSourceUrl: null, orderOnPage: 1 },
          ],
        }),
        makeSection({
          headingFa: "فیلتر روغن خودرو",
          categoryGuess: "oil-filter",
          products: [{ nameFa: "فیلتر روغن تویوتا", productSourceUrl: null, orderOnPage: 0 }],
        }),
      ]),
    );

    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({
      sectionIndex: 0,
      categoryGuess: "engine-oil",
      productSourceSlug: "toyota-5w30",
      priority: 0,
      specNote: "نکته : گرانروی پیشنهادی 5W30",
    });
    // The section named it but linked nothing — a spec-only item, not a skip.
    expect(candidates[1]).toMatchObject({ productSourceSlug: null, priority: 1 });
    expect(candidates[2]).toMatchObject({ sectionIndex: 1, categoryGuess: "oil-filter" });
  });

  it("falls back to list position when the page carries no order", () => {
    const candidates = fitmentCandidatesFor(
      makeCar([
        makeSection({
          products: [
            { nameFa: "اول", productSourceUrl: null, orderOnPage: null },
            { nameFa: "دوم", productSourceUrl: null, orderOnPage: null },
          ],
        }),
      ]),
    );

    expect(candidates.map((candidate) => candidate.priority)).toEqual([0, 1]);
  });

  // "نکته : گرانروی پیشنهادی 5W30" with no products under it is still the page
  // telling a customer what to buy — exactly what a spec-only item is for.
  it("keeps a product-less section that carries a note, and drops an empty one", () => {
    expect(
      fitmentCandidatesFor(makeCar([makeSection({ specNoteFa: "نکته : 5W30" })])),
    ).toHaveLength(1);
    expect(fitmentCandidatesFor(makeCar([makeSection()]))).toHaveLength(0);
  });
});

describe("fitmentSpecNote", () => {
  const candidate: FitmentCandidate = {
    sectionIndex: 0,
    categoryGuess: "oil-filter",
    headingFa: "فیلتر روغن خودرو",
    productSourceSlug: null,
    productNameFa: "فیلتر روغن تویوتا CHR",
    specNote: null,
    priority: 0,
  };

  it("prefers the section's own نکته, matched product or not", () => {
    const withNote = { ...candidate, specNote: "نکته : هر ۱۰،۰۰۰ کیلومتر" };
    expect(fitmentSpecNote(withNote, true)).toBe("نکته : هر ۱۰،۰۰۰ کیلومتر");
    expect(fitmentSpecNote(withNote, false)).toBe("نکته : هر ۱۰،۰۰۰ کیلومتر");
  });

  // An item with neither a product nor a note is not a recommendation and the
  // validation schema rejects one, so an unmatched product falls back to the
  // source's own words for the thing we don't stock.
  it("names the product we don't stock, then the heading", () => {
    expect(fitmentSpecNote(candidate, false)).toBe("فیلتر روغن تویوتا CHR");
    expect(fitmentSpecNote({ ...candidate, productNameFa: null }, false)).toBe("فیلتر روغن خودرو");
    expect(
      fitmentSpecNote({ ...candidate, productNameFa: null, headingFa: null }, false),
    ).toBeNull();
  });

  it("leaves a matched product's item bare when the section said nothing", () => {
    expect(fitmentSpecNote(candidate, true)).toBeNull();
  });
});

describe("fitmentHash", () => {
  const rows: CanonicalFitmentRow[] = [
    {
      categorySlug: "engine-oil",
      productSourceRef: "oil-city:product/toyota-5w30",
      specNote: null,
      priority: 0,
    },
    { categorySlug: "oil-filter", productSourceRef: null, specNote: "فیلتر روغن", priority: 0 },
  ];

  // The dedup itself: two model pages saying the same thing are one profile.
  it("is the same for two cars whose pages say the same thing", () => {
    expect(fitmentHash(rows)).toBe(fitmentHash(rows.map((row) => ({ ...row }))));
  });

  it("separates recommendations that differ", () => {
    const hash = fitmentHash(rows);
    expect(fitmentHash([rows[1], rows[0]])).not.toBe(hash);
    expect(fitmentHash([rows[0]])).not.toBe(hash);
    expect(fitmentHash([{ ...rows[0], priority: 1 }, rows[1]])).not.toBe(hash);
    expect(fitmentHash([{ ...rows[0], categorySlug: "fuel-filter" }, rows[1]])).not.toBe(hash);
  });

  // A car whose oil we stock and one whose oil we don't are not the same
  // recommendation, even where both pages named the same product.
  it("separates a matched product from the spec-only item it falls back to", () => {
    expect(fitmentHash([{ ...rows[0], productSourceRef: null, specNote: "روغن" }])).not.toBe(
      fitmentHash([rows[0]]),
    );
  });
});

describe("importHashNote", () => {
  it("marks a profile as the importer's own", () => {
    expect(importHashNote("abc123")).toBe("import-hash:abc123");
    expect(isImportHashNote(importHashNote("abc123"))).toBe(true);
  });

  // The rule that keeps a hand-made profile attached where an admin put it.
  it("doesn't claim a profile nobody imported", () => {
    expect(isImportHashNote(null)).toBe(false);
    expect(isImportHashNote("Peugeot 206 — checked against the manual")).toBe(false);
  });
});

describe("fitmentProfileLabel", () => {
  it("names the car that minted it and how much of its page it covers", () => {
    expect(fitmentProfileLabel(makeCar([]), 4)).toBe("تویوتا تویوتا CHR — 4 sections");
    expect(fitmentProfileLabel(makeCar([]), 1)).toBe("تویوتا تویوتا CHR — 1 section");
  });

  it("stays inside the admin form's label limit", () => {
    const car = { ...makeCar([]), modelNameFa: "م".repeat(300) };
    expect(fitmentProfileLabel(car, 3)).toHaveLength(200);
  });
});
