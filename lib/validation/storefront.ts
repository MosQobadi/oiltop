import { z } from "zod";
import { slugSchema } from "./common";

// Public storefront input schemas. Unlike the admin schemas these mostly guard
// path/query params rather than bodies — the car-finder routes are read-only —
// but they still run through Zod so a malformed segment returns a 400 instead
// of reaching Prisma.

// cuid path segments (car model / car engine ids). Nothing to validate beyond
// "non-empty" — an id that doesn't exist is a 404, not a 400.
export const storefrontIdParamSchema = z.string().min(1, "Invalid id");

export const carBrandSlugParamSchema = slugSchema;

// The car-finder's Engine step always arrives with the year the customer picked
// in the previous step, so it's required rather than defaulted.
export const carFinderEngineQuerySchema = z.object({
  year: z.coerce
    .number({ error: "year is required" })
    .int("year must be a whole number")
    .min(1900, "year must be 1900 or later")
    .max(2100, "year must be 2100 or earlier"),
});

export type CarFinderEngineQuery = z.infer<typeof carFinderEngineQuerySchema>;
