import { z } from "zod";

// The scrape batch format — one JSON file per batch under `scrape/<source>/`,
// written by the extraction prompt in section 4 of `oil-city-import-notes.md`.
// Nothing downstream reads a batch file that hasn't been through this schema.
//
// Two rules from that prompt shape everything below.
//
// "NEVER invent a value. Not on the page → null." The extractor is forbidden to
// guess, so almost every field here is nullable. Only the natural keys the
// importer deduplicates on — a product's `sourceSlug`, a car's `brandNameFa` /
// `modelNameFa` — plus `sourceUrl` are required. Whether a particular null
// makes a record *importable* is a business rule and belongs to the importer;
// this schema's job is to catch a batch whose shape is wrong, not to second-
// guess an absence the extractor correctly reported.
//
// "Every key present in every record." So the optional fields are nullable, not
// optional: a key the extractor silently dropped is drift in the extraction
// itself, worth failing on while there is still one batch to re-run rather than
// three thousand records to re-check.
//
// Unknown keys are stripped rather than rejected. A renamed field already shows
// up as a missing required key, so strictness would only add failure modes.

// Persian, verbatim, and frequently the raw URL segment — `slugSchema` would
// reject nearly all of it, because `lib/slug.ts` strips everything outside
// [a-z0-9] and so `slugify("فیلتر روغن")` is `""`. Deriving a usable
// `Product.slug` from this is the importer's problem (mismatch 3.4 in the
// notes); recording what the source actually said is this schema's.
//
// Trimmed — the one place the "verbatim" rule bends, because leading whitespace
// on a key is pure noise that would split one product into two on re-import.
const sourceKeySchema = z.string().trim().min(1, "Required — this is the record's natural key");

// Never trimmed or normalised: "Persian text goes in verbatim, including ZWNJ
// and spacing."
const sourceTextSchema = z.string().nullable();

const sourceUrlSchema = z.url();

// The site labels prices تومان, so these are whole Toman as printed — no
// conversion, no decimals.
const wholeTomanSchema = z.number().int("Prices are whole Toman").nonnegative().nullable();

// The extractor writes `[]` / `{}` for "none". A null means the same thing and
// turns up often enough that normalising it here saves every consumer a branch.
function emptyListWhenNull<T extends z.ZodType>(item: T) {
  return z
    .array(item)
    .nullable()
    .transform((value) => value ?? []);
}

// Spec badges, keys and values verbatim in Persian, e.g. {"درجه گرانروی":
// "5W30", "حجم": "4 لیتر"}. Values stay strings even when they look numeric —
// "4 لیتر" is what the page says, and parsing a volume out of it is the
// importer's job, not the extractor's.
const specsSchema = z
  .record(z.string(), z.string())
  .nullable()
  .transform((value) => value ?? {});

// Provenance, not data, so "parseable" is enough — failing a whole batch over a
// date format would be the wrong trade.
const extractedAtSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be a parseable date/time");

// The five categories we actually have. Coolant, brake oil, ATF, shock oil,
// additives, air freshener, spare parts and anything the extractor was unsure
// of are all null (mismatch 3.2 / DECISION 2 in the notes). `sourceCategoryText`
// and `headingFa` keep the source's own wording, so nothing is lost by a null
// guess and the decision can be revisited without re-scraping.
export const scrapeCategoryGuessSchema = z.enum([
  "engine-oil",
  "oil-filter",
  "air-filter",
  "cabin-filter",
  "fuel-filter",
]);

export const scrapeProductSchema = z.object({
  sourceSlug: sourceKeySchema,
  nameFa: sourceTextSchema,
  // The site's "برند :" value as printed, even where it contradicts the product
  // title (a Toyota-titled oil carrying "برند : لکسوس"). Imported as stated and
  // flagged in `problems`, never auto-corrected.
  brandLabelFa: sourceTextSchema,
  sourceCategoryText: sourceTextSchema,
  categoryGuess: scrapeCategoryGuessSchema.nullable(),
  // On a discounted product the struck-through figure is `originalPriceToman`
  // and the highlighted one is `priceToman`; with no strikethrough the original
  // is null. `priceRawText` carries both verbatim either way.
  priceToman: wholeTomanSchema,
  originalPriceToman: wholeTomanSchema,
  priceRawText: sourceTextSchema,
  specs: specsSchema,
  // Empty for everything from oil-city.ir — the numbers exist only as print on
  // the product photograph (mismatch 3.3). The field stays because a later
  // source may carry them.
  oemPartNumbers: emptyListWhenNull(z.string()),
  shortDescriptionFa: sourceTextSchema,
  longDescriptionFa: sourceTextSchema,
  imageUrls: emptyListWhenNull(sourceUrlSchema),
  stockRawText: sourceTextSchema,
  sourceUrl: sourceUrlSchema,
});

export const scrapeSectionProductSchema = z.object({
  nameFa: sourceTextSchema,
  // Null where the section names a product it doesn't link to. The importer
  // matches on this URL, so a null here means a spec-only fitment item.
  productSourceUrl: sourceUrlSchema.nullable(),
  orderOnPage: z.number().int().nonnegative().nullable(),
});

// One accordion on a car model page, in page order.
export const scrapeCarSectionSchema = z.object({
  // The full heading verbatim — it carries the capacity, e.g. "روغن موتور خودرو
  // (با فیلتر روغن ۴.۲ لیتر بدون فیلتر روغن ۳.۹ لیتر)".
  headingFa: sourceTextSchema,
  categoryGuess: scrapeCategoryGuessSchema.nullable(),
  capacityText: sourceTextSchema,
  // The نکته box: change interval, capacity, viscosity, API grade.
  specNoteFa: sourceTextSchema,
  products: emptyListWhenNull(scrapeSectionProductSchema),
});

export const scrapeCarSchema = z.object({
  // The source has no engines and no years — its recommendation hangs off the
  // model, with the engine baked into the model's identity. So the natural key
  // is the brand + model name pair, and the importer synthesises the CarEngine
  // our schema needs (mismatch 3.1). The URL slugs are recorded but can't be
  // the key: they are sometimes Latin, sometimes raw Persian.
  brandNameFa: sourceKeySchema,
  brandSourceSlug: sourceTextSchema,
  modelNameFa: sourceKeySchema,
  modelSourceSlug: sourceTextSchema,
  // Any engine/drivetrain text the model's own title carries, e.g. "1800cc
  // هیبرید" — the only source for the synthesised engine's label.
  modelDescriptorText: sourceTextSchema,
  sourceUrl: sourceUrlSchema,
  sections: emptyListWhenNull(scrapeCarSectionSchema),
});

// Anything the extractor couldn't fit the format — a layout it didn't expect, a
// brand label contradicting a title, page text that addressed it directly. Both
// fields required: a problem report with no description isn't one.
export const scrapeProblemSchema = z.object({
  sourceUrl: sourceUrlSchema,
  issue: z.string().trim().min(1, "A problem needs a description"),
});

export const scrapeBatchMetaSchema = z.object({
  batchLabel: z.string().trim().min(1, "batchLabel is required"),
  sourceUrls: z.array(sourceUrlSchema).min(1, "A batch covers at least one source URL"),
  extractedAt: extractedAtSchema,
  // The extractor's own tally. Left unchecked against the arrays here — a
  // mismatch means a truncated batch, which is a report the importer makes, not
  // a reason this schema refuses to hand the file over.
  counts: z.object({
    products: z.number().int().nonnegative(),
    carModels: z.number().int().nonnegative(),
    fitmentRows: z.number().int().nonnegative(),
  }),
});

export const scrapeBatchSchema = z.object({
  _meta: scrapeBatchMetaSchema,
  products: emptyListWhenNull(scrapeProductSchema),
  cars: emptyListWhenNull(scrapeCarSchema),
  problems: emptyListWhenNull(scrapeProblemSchema),
});

export type ScrapeCategoryGuess = z.infer<typeof scrapeCategoryGuessSchema>;
export type ScrapeProduct = z.infer<typeof scrapeProductSchema>;
export type ScrapeSectionProduct = z.infer<typeof scrapeSectionProductSchema>;
export type ScrapeCarSection = z.infer<typeof scrapeCarSectionSchema>;
export type ScrapeCar = z.infer<typeof scrapeCarSchema>;
export type ScrapeProblem = z.infer<typeof scrapeProblemSchema>;
export type ScrapeBatchMeta = z.infer<typeof scrapeBatchMetaSchema>;
export type ScrapeBatch = z.infer<typeof scrapeBatchSchema>;

export type ScrapeBatchParseResult =
  { success: true; data: ScrapeBatch } | { success: false; errors: string[] };

// "cars[3].sections[1].products[0].nameFa" — the record index is the whole
// point, so array positions stay as [n] rather than being flattened into dots.
function formatIssuePath(path: readonly PropertyKey[]): string {
  const formatted = path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    return acc === "" ? String(segment) : `${acc}.${String(segment)}`;
  }, "");

  // A root-level failure (the file isn't an object at all) has an empty path.
  return formatted === "" ? "<batch>" : formatted;
}

// One line per issue, each naming the file, the path to the exact record and
// field, and what was wrong with it. A three-thousand-record batch that fails
// with one line of context is useless; this is what makes the failure fixable.
export function formatScrapeBatchErrors(fileName: string, error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${fileName}: ${formatIssuePath(issue.path)} — ${issue.message}`,
  );
}

export function parseScrapeBatch(fileName: string, input: unknown): ScrapeBatchParseResult {
  const result = scrapeBatchSchema.safeParse(input);

  if (result.success) return { success: true, data: result.data };

  return { success: false, errors: formatScrapeBatchErrors(fileName, result.error) };
}

// The file-level entry point: batches arrive as text on disk, and a syntax
// error in one deserves the same "which file" context as a schema error.
export function parseScrapeBatchJson(fileName: string, text: string): ScrapeBatchParseResult {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { success: false, errors: [`${fileName}: <batch> — not valid JSON: ${detail}`] };
  }

  return parseScrapeBatch(fileName, raw);
}
