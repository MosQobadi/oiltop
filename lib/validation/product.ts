import { z } from "zod";
import { stripHtml } from "@/lib/sanitize";
import { pageSchema, pageSizeSchema, slugSchema } from "./common";
import { productStatusSchema } from "./enums";

// The three fields that carry a create-time default, kept default-free here
// because `.partial()` does not unwrap a ZodDefault: left in the shared shape,
// a PATCH that omitted them would still parse to the default and silently
// reset the column — renaming a product would zero its discount and wipe its
// tags. Create opts into the defaults, update doesn't.
const discountPercentField = z.number().int().min(0).max(100);
const tagsField = z.array(z.string().min(1).max(50));
const oemPartNumbersField = z.array(z.string().min(1).max(50));

// Deliberately permissive: "5W-30", "5W30", "5W 30", "5W", and the plain
// monogrades gear and older engine oils are still sold under ("40"). It exists
// to keep prose and typos out of a column meant to be filtered on, not to be a
// catalogue of every grade in existence. Exported so the admin form can reject
// the same strings client-side instead of keeping a second copy that drifts.
export const VISCOSITY_PATTERN = /^(\d{1,3}W([ -]?\d{1,3})?|\d{1,3})$/;

export const VISCOSITY_ERROR = 'Viscosity must look like "5W-30" or "40"';

// Uppercased on the way in — these are codes, not prose, and the whole point of
// the columns is that "5w30" and "5W-30" answer the same query.
const upperCase = (value: string) => value.toUpperCase();

const viscosityField = z
  .string()
  .trim()
  .max(20)
  .transform(upperCase)
  .refine((value) => VISCOSITY_PATTERN.test(value), VISCOSITY_ERROR);

const apiGradeField = z.string().trim().min(1).max(20).transform(upperCase);

const volumeMlField = z.number().int().positive("volumeMl must be a positive whole number");

const productShape = {
  sku: z.string().min(1).max(64),
  // Optional on create — auto-generated from nameEn via slugify() when omitted,
  // same as Category and Brand.
  slug: slugSchema.optional(),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  categoryId: z.string().min(1, "categoryId is required"),
  brandId: z.string().min(1, "brandId is required"),
  price: z.number().nonnegative("price must be >= 0"),
  discountPercent: discountPercentField.default(0),
  tags: tagsField.default([]),
  oemPartNumbers: oemPartNumbersField.default([]),
  // Nullable as well as optional: omitting one leaves the stored value alone,
  // sending null is how the admin form clears a spec it filled in by mistake.
  viscosity: viscosityField.nullable().optional(),
  apiGrade: apiGradeField.nullable().optional(),
  volumeMl: volumeMlField.nullable().optional(),
  // Not editable in the admin UI — the importer writes it. Validated only as
  // far as "an object of some shape", which is all the column promises.
  specs: z.record(z.string(), z.unknown()).optional(),
  shortDescriptionEn: z.string().min(1).max(500).transform(stripHtml),
  shortDescriptionFa: z.string().min(1).max(500).transform(stripHtml),
  longDescriptionEn: z.string().min(1).max(5000).transform(stripHtml),
  longDescriptionFa: z.string().min(1).max(5000).transform(stripHtml),
  metaTitleEn: z.string().max(70).transform(stripHtml).optional(),
  metaTitleFa: z.string().max(70).transform(stripHtml).optional(),
  metaDescriptionEn: z.string().max(160).transform(stripHtml).optional(),
  metaDescriptionFa: z.string().max(160).transform(stripHtml).optional(),
  image: z.string().min(1).optional(),
  status: productStatusSchema,
};

export const productCreateSchema = z.object(productShape);
export const productUpdateSchema = z
  .object({
    ...productShape,
    discountPercent: discountPercentField,
    tags: tagsField,
    oemPartNumbers: oemPartNumbersField,
  })
  .partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  status: productStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
