import { z } from "zod";
import { pageSchema, pageSizeSchema, slugSchema } from "./common";
import { filterKindSchema, partTypeSchema } from "./enums";

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

// --- Catalog (PLP / PDP) ---------------------------------------------------

// PLP sorting. Name sorting is deliberately absent: the correct ordering
// depends on which of nameEn/nameFa is being rendered, and the API doesn't
// know the locale — add it alongside the PLP screen if it's wanted, with the
// locale passed in.
export const storefrontProductSortSchema = z
  .enum(["newest", "price-asc", "price-desc"])
  .default("newest");

export type StorefrontProductSort = z.infer<typeof storefrontProductSortSchema>;

export const storefrontProductListQuerySchema = z.object({
  // Both accept a slug (what a storefront URL carries) or a cuid — see
  // categoryOrSlugFilter in lib/services/catalog.ts.
  category: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  partType: partTypeSchema.optional(),
  filterKind: filterKindSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: storefrontProductSortSchema,
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type StorefrontProductListQuery = z.infer<
  typeof storefrontProductListQuerySchema
>;

export const storefrontProductSlugParamSchema = slugSchema;

// The storefront's out-of-stock form asks for one field and accepts either an
// email or a phone number, so this can't be z.email() — it's a loose shape
// check to keep obvious junk out of the table, not an identity check. The
// contact is only ever read back by the restock notifier.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

export const stockNotificationCreateSchema = z.object({
  contact: z
    .string()
    .trim()
    .min(1, "contact is required")
    .max(150)
    .refine(
      (value) => EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value),
      "contact must be a valid email address or phone number",
    ),
});

export type StockNotificationCreateInput = z.infer<
  typeof stockNotificationCreateSchema
>;

// An untouched optional field in a storefront form posts as "" rather than
// being omitted, and 400ing a customer over a field they deliberately skipped
// is a dead end — so blank means "not provided" in the schemas below.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

// --- Customer accounts -----------------------------------------------------

// The storefront register form asks for a phone number and treats email as
// optional — the customer-side half of the rule in `userIdentifiersSchema`
// (lib/validation/auth.ts), stated directly here because the register route
// only ever creates CUSTOMER accounts. `role` and `status` are deliberately
// absent: the server sets both, a client can't ask for an admin account.
export const storefrontRegisterSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "firstName is required")
    .max(100, "firstName must be 100 characters or fewer"),
  lastName: z
    .string()
    .trim()
    .min(1, "lastName is required")
    .max(100, "lastName must be 100 characters or fewer"),
  phone: z
    .string()
    .trim()
    .min(6, "phone is required")
    .max(30, "phone must be 30 characters or fewer")
    .regex(PHONE_PATTERN, "phone must be a valid phone number"),
  email: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .email("email must be a valid email address")
      .max(150)
      .optional(),
  ),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .max(100, "password must be 100 characters or fewer"),
});

export type StorefrontRegisterInput = z.infer<typeof storefrontRegisterSchema>;

// --- Fitment inquiry (lead capture) ----------------------------------------

// Deliberately leaner than the admin fitmentInquiryCreateSchema: a customer
// hitting the "no recommendation for your car yet" fallback gives a name and a
// phone number, and everything else is optional. `status` and `adminNote` are
// absent on purpose — the server always writes status NEW, and the note is the
// admin panel's field, not the customer's.
export const storefrontFitmentInquiryCreateSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, "customerName is required")
    .max(150, "customerName must be 150 characters or fewer"),
  phone: z
    .string()
    .trim()
    .min(6, "phone is required")
    .max(30, "phone must be 30 characters or fewer"),
  email: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .email("email must be a valid email address")
      .max(150)
      .optional(),
  ),
  message: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(2000, "message must be 2000 characters or fewer")
      .optional(),
  ),
  // Supplied by the car finder when the customer got this far through it; an
  // id that doesn't exist is rejected by the service, not here.
  carEngineId: z.preprocess(blankToUndefined, z.string().trim().optional()),
  categoryId: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export type StorefrontFitmentInquiryCreateInput = z.infer<
  typeof storefrontFitmentInquiryCreateSchema
>;
