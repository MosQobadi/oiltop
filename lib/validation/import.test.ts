import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScrapeBatch, parseScrapeBatchJson, scrapeBatchSchema } from "./import";

const fixturePath = fileURLToPath(new URL("./__fixtures__/scrape-batch.json", import.meta.url));
const fixtureText = readFileSync(fixturePath, "utf8");

// A minimal batch that parses, rebuilt per test so mutations don't leak.
function makeBatch() {
  return {
    _meta: {
      batchLabel: "test batch",
      sourceUrls: ["https://www.oil-city.ir/car/toyota/"],
      extractedAt: "2026-08-11T09:20:00.000Z",
      counts: { products: 1, carModels: 1, fitmentRows: 1 },
    },
    products: [
      {
        sourceSlug: "toyota-5w30",
        nameFa: "روغن موتور تویوتا",
        brandLabelFa: null,
        sourceCategoryText: null,
        categoryGuess: "engine-oil",
        priceToman: 1450000,
        originalPriceToman: null,
        priceRawText: null,
        specs: {},
        oemPartNumbers: [],
        shortDescriptionFa: null,
        longDescriptionFa: null,
        imageUrls: [],
        stockRawText: null,
        sourceUrl: "https://www.oil-city.ir/product/toyota-5w30/",
      },
    ],
    cars: [
      {
        brandNameFa: "تویوتا",
        brandSourceSlug: "toyota",
        modelNameFa: "تویوتا CHR",
        modelSourceSlug: "chr",
        modelDescriptorText: "1800cc هیبرید",
        sourceUrl: "https://www.oil-city.ir/car/toyota/chr/",
        sections: [
          {
            headingFa: "روغن موتور خودرو",
            categoryGuess: "engine-oil",
            capacityText: null,
            specNoteFa: null,
            products: [
              {
                nameFa: "روغن موتور تویوتا",
                productSourceUrl: "https://www.oil-city.ir/product/toyota-5w30/",
                orderOnPage: 0,
              },
            ],
          },
        ],
      },
    ],
    problems: [],
  };
}

describe("the committed fixture batch", () => {
  it("parses", () => {
    const result = parseScrapeBatchJson("scrape-batch.json", fixtureText);

    expect(result.success ? [] : result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("keeps every record the file holds", () => {
    const result = parseScrapeBatchJson("scrape-batch.json", fixtureText);

    if (!result.success) throw new Error(result.errors.join("\n"));

    expect(result.data.products).toHaveLength(result.data._meta.counts.products);
    expect(result.data.cars).toHaveLength(result.data._meta.counts.carModels);
    expect(result.data.cars[0]?.sections).toHaveLength(4);
  });

  // The fixture is only worth having if it still carries the source's own text:
  // a build step or an editor that re-encodes it would leave a file that parses
  // but no longer means anything. ‌ is the ZWNJ in "خنک‌کننده".
  it("round-trips Persian text verbatim, ZWNJ included", () => {
    const result = parseScrapeBatchJson("scrape-batch.json", fixtureText);

    if (!result.success) throw new Error(result.errors.join("\n"));

    expect(result.data.products[0]?.nameFa).toBe("روغن موتور تویوتا 5W30 اس ان حجم 4 لیتر");
    expect(result.data.products[2]?.nameFa).toContain("خنک‌کننده");
    expect(result.data.cars[0]?.sections[0]?.headingFa).toBe(
      "روغن موتور خودرو (با فیلتر روغن ۴.۲ لیتر بدون فیلتر روغن ۳.۹ لیتر)",
    );

    const reparsed = parseScrapeBatch("round-trip", JSON.parse(JSON.stringify(result.data)));

    expect(reparsed.success && reparsed.data).toEqual(result.data);
  });

  // The three shapes the importer has to survive, all present on purpose.
  it("covers a discounted oil, a filter with no specs, and an uncategorised part", () => {
    const result = parseScrapeBatchJson("scrape-batch.json", fixtureText);

    if (!result.success) throw new Error(result.errors.join("\n"));

    const [oil, filter, coolant] = result.data.products;

    expect(oil?.originalPriceToman).toBe(1780000);
    expect(oil?.priceToman).toBeLessThan(oil!.originalPriceToman!);
    expect(filter?.specs).toEqual({});
    // A null guess must not lose the source's own wording — that text is what a
    // later decision about extra categories would be made from.
    expect(coolant?.categoryGuess).toBeNull();
    expect(coolant?.sourceCategoryText).toBe("ضدیخ و مایع خنک کننده");
  });

  // The source's brand label contradicts the product title here, and the batch
  // records both rather than reconciling them.
  it("keeps a contradicting brand label and reports it as a problem", () => {
    const result = parseScrapeBatchJson("scrape-batch.json", fixtureText);

    if (!result.success) throw new Error(result.errors.join("\n"));

    expect(result.data.products[0]?.brandLabelFa).toBe("لکسوس");
    expect(result.data.problems.length).toBeGreaterThan(0);
  });
});

describe("parseScrapeBatch error reporting", () => {
  it("names the file, the record index and the field", () => {
    const batch = makeBatch();
    batch.products[0]!.sourceSlug = "   ";

    const result = parseScrapeBatch("scrape/oil-city/batch-01.json", batch);

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.errors).toEqual([
      "scrape/oil-city/batch-01.json: products[0].sourceSlug — Required — this is the record's natural key",
    ]);
  });

  it("names the full path into a car's sections", () => {
    const batch = makeBatch();
    batch.cars[0]!.sections[0]!.products[0]!.productSourceUrl = "not-a-url";

    const result = parseScrapeBatch("batch-02.json", batch);

    expect(result.success ? [] : result.errors).toEqual([
      "batch-02.json: cars[0].sections[0].products[0].productSourceUrl — Invalid URL",
    ]);
  });

  // One line per bad field, not one line per file: a batch with three thousand
  // records has to say which of them to look at.
  it("reports every bad record, not just the first", () => {
    const batch = makeBatch();
    batch.products.push({ ...makeBatch().products[0]!, sourceUrl: "nope" });
    batch.cars[0]!.brandNameFa = "";

    const result = parseScrapeBatch("batch-03.json", batch);

    expect(result.success ? [] : result.errors).toEqual([
      "batch-03.json: products[1].sourceUrl — Invalid URL",
      "batch-03.json: cars[0].brandNameFa — Required — this is the record's natural key",
    ]);
  });

  it("labels a root-level failure rather than emitting an empty path", () => {
    const result = parseScrapeBatch("batch-04.json", []);

    expect(result.success ? [] : result.errors).toEqual([
      "batch-04.json: <batch> — Invalid input: expected object, received array",
    ]);
  });

  it("names the file when the JSON itself is malformed", () => {
    const result = parseScrapeBatchJson("batch-05.json", "{ nope");

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.errors[0]).toMatch(
      /^batch-05\.json: <batch> — not valid JSON: /,
    );
  });
});

describe("scrapeBatchSchema field rules", () => {
  // "Every key present in every record" — a key the extractor dropped is drift
  // in the extraction, and is cheapest to catch on the first batch.
  it("requires every documented key, even the nullable ones", () => {
    const batch = makeBatch();
    delete (batch.products[0] as Record<string, unknown>).stockRawText;

    const result = parseScrapeBatch("batch-06.json", batch);

    expect(result.success ? [] : result.errors).toEqual([
      "batch-06.json: products[0].stockRawText — Invalid input: expected string, received undefined",
    ]);
  });

  it("accepts null for every field that is not a natural key or a sourceUrl", () => {
    const batch = makeBatch();
    Object.assign(batch.products[0]!, {
      nameFa: null,
      categoryGuess: null,
      priceToman: null,
      specs: null,
      oemPartNumbers: null,
      imageUrls: null,
    });

    const result = parseScrapeBatch("batch-07.json", batch);

    expect(result.success).toBe(true);
  });

  // A null list and an empty list say the same thing, so the parsed batch only
  // ever has one of them and the importer never branches on it.
  it("normalises a null list or spec object to empty", () => {
    const batch = makeBatch();
    Object.assign(batch.products[0]!, { specs: null, oemPartNumbers: null, imageUrls: null });
    batch.cars[0]!.sections[0]!.products = null as never;

    const parsed = scrapeBatchSchema.parse(batch);

    expect(parsed.products[0]?.specs).toEqual({});
    expect(parsed.products[0]?.oemPartNumbers).toEqual([]);
    expect(parsed.products[0]?.imageUrls).toEqual([]);
    expect(parsed.cars[0]?.sections[0]?.products).toEqual([]);
  });

  // Leading whitespace on a natural key would split one product into two across
  // re-imports, which is the one thing the key exists to prevent.
  it("trims the natural keys and nothing else", () => {
    const batch = makeBatch();
    batch.products[0]!.sourceSlug = "  toyota-5w30  ";
    batch.products[0]!.nameFa = "  روغن موتور تویوتا  ";

    const parsed = scrapeBatchSchema.parse(batch);

    expect(parsed.products[0]?.sourceSlug).toBe("toyota-5w30");
    expect(parsed.products[0]?.nameFa).toBe("  روغن موتور تویوتا  ");
  });

  // The URL slug is sometimes Latin and sometimes raw Persian, so the natural
  // key cannot be run through slugSchema — slugify("فیلتر روغن") is "".
  it("accepts a Persian sourceSlug", () => {
    const batch = makeBatch();
    batch.products[0]!.sourceSlug = "فیلتر-روغن-تویوتا";

    expect(parseScrapeBatch("batch-08.json", batch).success).toBe(true);
  });

  it("rejects a categoryGuess outside the five categories we have", () => {
    const batch = makeBatch();
    batch.products[0]!.categoryGuess = "coolant";

    const result = parseScrapeBatch("batch-09.json", batch);

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.errors[0]).toContain("products[0].categoryGuess");
  });

  it("rejects a price that arrived as text instead of a number", () => {
    const batch = makeBatch();
    batch.products[0]!.priceToman = "۱,۴۵۰,۰۰۰ تومان" as never;

    expect(parseScrapeBatch("batch-10.json", batch).success).toBe(false);
  });

  it("rejects a fractional price — the site prints whole Toman", () => {
    const batch = makeBatch();
    batch.products[0]!.priceToman = 1450000.5;

    const result = parseScrapeBatch("batch-11.json", batch);

    expect(result.success ? "" : result.errors[0]).toContain("Prices are whole Toman");
  });

  it("rejects a batch that names no source URL", () => {
    const batch = makeBatch();
    batch._meta.sourceUrls = [];

    expect(parseScrapeBatch("batch-12.json", batch).success).toBe(false);
  });

  it("rejects an unparseable extractedAt", () => {
    const batch = makeBatch();
    batch._meta.extractedAt = "last tuesday";

    const result = parseScrapeBatch("batch-13.json", batch);

    expect(result.success ? "" : result.errors[0]).toContain("_meta.extractedAt");
  });

  it("rejects a problem report with no description", () => {
    const batch = makeBatch();
    batch.problems.push({
      sourceUrl: "https://www.oil-city.ir/car/toyota/chr/",
      issue: "",
    } as never);

    const result = parseScrapeBatch("batch-14.json", batch);

    expect(result.success ? "" : result.errors[0]).toContain("problems[0].issue");
  });
});
