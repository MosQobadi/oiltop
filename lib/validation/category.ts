import { z } from "zod";
import { stripHtml } from "@/lib/sanitize";
import { pageSchema, pageSizeSchema, slugSchema, sourceFilterSchema } from "./common";
import { categoryStatusSchema, partTypeSchema } from "./enums";

// Kept default-free here because `.partial()` does not unwrap a ZodDefault:
// left as `.default([])` in the shared shape, a PATCH that omitted tags would
// still parse to [] and silently clear the column — renaming a category would
// wipe its tags. Create opts into the default, update doesn't.
const tagsField = z.array(z.string().min(1).max(50));

const categoryShape = {
  // Optional on create — auto-generated from nameEn via slugify() when omitted.
  slug: slugSchema.optional(),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  tags: tagsField.default([]),
  shortDescriptionEn: z.string().min(1).max(500).transform(stripHtml),
  shortDescriptionFa: z.string().min(1).max(500).transform(stripHtml),
  longDescriptionEn: z.string().min(1).max(5000).transform(stripHtml),
  longDescriptionFa: z.string().min(1).max(5000).transform(stripHtml),
  metaTitleEn: z.string().max(70).transform(stripHtml).optional(),
  metaTitleFa: z.string().max(70).transform(stripHtml).optional(),
  metaDescriptionEn: z.string().max(160).transform(stripHtml).optional(),
  metaDescriptionFa: z.string().max(160).transform(stripHtml).optional(),
  image: z.string().min(1).optional(),
  status: categoryStatusSchema,
  // What the category *behaves* like, not a second name for it — see PartType
  // in prisma/schema.prisma.
  partType: partTypeSchema,
};

export const categoryCreateSchema = z.object(categoryShape);
export const categoryUpdateSchema = z.object({ ...categoryShape, tags: tagsField }).partial();

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const categoryListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: categoryStatusSchema.optional(),
  partType: partTypeSchema.optional(),
  source: sourceFilterSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
