import { describe, expect, it } from "vitest";
import {
  brandLabelDisagrees,
  deriveSku,
  deriveSlug,
  discountPercentFrom,
  fallbackSlug,
  mapFuelType,
  normaliseForMatch,
  parseApiGrade,
  parseProductSpecs,
  parseViscosity,
  parseVolumeMl,
  sourceRefFor,
  toLatinDigits,
  truncate,
} from "./import";

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

  it("reports no match rather than defaulting to petrol", () => {
    expect(mapFuelType("تویوتا CHR", null)).toBeNull();
    expect(mapFuelType(null, null)).toBeNull();
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
