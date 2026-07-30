import { z } from "zod";
import { pageSchema, pageSizeSchema, slugSchema } from "./common";
import { carModelStatusSchema } from "./enums";

const carModelShape = {
  carBrandId: z.string().min(1, "carBrandId is required"),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  // Optional on create — auto-generated from nameEn via slugify() when omitted.
  slug: slugSchema.optional(),
  metaTitleEn: z.string().max(70).optional(),
  metaTitleFa: z.string().max(70).optional(),
  metaDescriptionEn: z.string().max(160).optional(),
  metaDescriptionFa: z.string().max(160).optional(),
  image: z.string().min(1).optional(),
  status: carModelStatusSchema,
};

export const carModelCreateSchema = z.object(carModelShape);
export const carModelUpdateSchema = z.object(carModelShape).partial();

export type CarModelCreateInput = z.infer<typeof carModelCreateSchema>;
export type CarModelUpdateInput = z.infer<typeof carModelUpdateSchema>;

export const carModelListQuerySchema = z.object({
  carBrandId: z.string().min(1, "carBrandId is required"),
  search: z.string().trim().min(1).optional(),
  status: carModelStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type CarModelListQuery = z.infer<typeof carModelListQuerySchema>;
