import { z } from "zod";
import { pageSchema, pageSizeSchema, slugSchema } from "./common";
import { carBrandStatusSchema } from "./enums";

const carBrandShape = {
  // Optional on create — auto-generated from nameEn via slugify() when omitted.
  slug: slugSchema.optional(),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  logo: z.string().min(1).optional(),
  status: carBrandStatusSchema,
};

export const carBrandCreateSchema = z.object(carBrandShape);
export const carBrandUpdateSchema = z.object(carBrandShape).partial();

export type CarBrandCreateInput = z.infer<typeof carBrandCreateSchema>;
export type CarBrandUpdateInput = z.infer<typeof carBrandUpdateSchema>;

export const carBrandListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: carBrandStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type CarBrandListQuery = z.infer<typeof carBrandListQuerySchema>;
