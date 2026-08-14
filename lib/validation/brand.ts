import { z } from "zod";
import { pageSchema, pageSizeSchema, slugSchema } from "./common";
import { brandStatusSchema } from "./enums";

// Null is "unordered" — the storefront sorts those last, alphabetically.
const sortOrderField = z.number().int().min(0).max(9999).nullable();

const brandShape = {
  // Optional on create — auto-generated from nameEn via slugify() when omitted.
  slug: slugSchema.optional(),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  logo: z.string().min(1).optional(),
  status: brandStatusSchema,
  // Storefront display order, lowest first — see Brand.sortOrder. Kept
  // default-free in the update schema: a default that survives `.partial()`
  // would drop the brand's position every time something else about it was
  // edited.
  sortOrder: sortOrderField.default(null),
};

export const brandCreateSchema = z.object(brandShape);
export const brandUpdateSchema = z.object({ ...brandShape, sortOrder: sortOrderField }).partial();

export type BrandCreateInput = z.infer<typeof brandCreateSchema>;
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;

export const brandListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: brandStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type BrandListQuery = z.infer<typeof brandListQuerySchema>;
