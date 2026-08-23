import { z } from "zod";

// The year-enrichment scrape format — one JSON file per run under
// `scrape/hamrah-mechanic/`. Deliberately NOT D.1's batch format and never fed
// to `scripts/import.ts`: this is input for the enrichment pass only, which
// updates year fields on rows the oil-city import already created.
//
// Same discipline as D.1 all the same: every key present on every record, nulls
// rather than guesses, and anything the extractor could not fit into the shape
// goes to `problems` instead of being improvised into it.

// Persian, verbatim, as the source's own page titles print it — "پژو 405 SLX".
// Note that the name INCLUDES the maker, which is what lets it be matched
// against our `carBrand.nameFa + " " + carModel.nameFa` without needing a
// mapping between two sets of brand slugs.
const sourceTextSchema = z.string().trim().min(1);

export const yearCalendarSchema = z.enum(["JALALI", "GREGORIAN"]);

export const enrichmentModelSchema = z
  .object({
    makerSlug: z.string().trim().min(1),
    modelSlug: z.string().trim().min(1),
    nameFa: sourceTextSchema,
    yearStart: z.number().int(),
    yearEnd: z.number().int(),
    // Derived from the year values, never read off the page — the two calendars
    // occupy disjoint numeric windows, so a year identifies its own.
    yearCalendar: yearCalendarSchema,
    sourceUrl: z.url(),
  })
  .refine((model) => model.yearEnd >= model.yearStart, {
    message: "yearEnd must be greater than or equal to yearStart",
    path: ["yearEnd"],
  });

export const enrichmentProblemSchema = z.object({
  sourceUrl: z.string().trim().min(1),
  issue: z.string().trim().min(1, "A problem needs a description"),
});

export const enrichmentFileSchema = z.object({
  _meta: z.object({
    source: z.literal("hamrah-mechanic"),
    extractedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Must be a parseable date"),
    makers: z.array(z.string()),
  }),
  models: z.array(enrichmentModelSchema),
  problems: z.array(enrichmentProblemSchema),
});

export type EnrichmentModel = z.infer<typeof enrichmentModelSchema>;
export type EnrichmentFile = z.infer<typeof enrichmentFileSchema>;

export type EnrichmentParseResult =
  { success: true; data: EnrichmentFile } | { success: false; errors: string[] };

export function parseEnrichmentFile(fileName: string, input: unknown): EnrichmentParseResult {
  const result = enrichmentFileSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${fileName}: ${issue.path.join(".") || "<file>"} — ${issue.message}`,
    ),
  };
}
