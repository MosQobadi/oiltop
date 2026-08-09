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
