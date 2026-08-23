import { z } from "zod";
import { stripHtml } from "@/lib/sanitize";
import { pageSchema, pageSizeSchema, slugSchema } from "./common";
import { carModelStatusSchema, yearCalendarSchema } from "./enums";

const carModelShape = {
  carBrandId: z.string().min(1, "carBrandId is required"),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  // Optional on create — auto-generated from nameEn via slugify() when omitted.
  slug: slugSchema.optional(),
  metaTitleEn: z.string().max(70).transform(stripHtml).optional(),
  metaTitleFa: z.string().max(70).transform(stripHtml).optional(),
  metaDescriptionEn: z.string().max(160).transform(stripHtml).optional(),
  metaDescriptionFa: z.string().max(160).transform(stripHtml).optional(),
  // Nullable, not merely optional: on a PATCH an omitted key means "leave it",
  // so clearing the photo needs an explicit null to say so.
  image: z.string().min(1).nullable().optional(),
  status: carModelStatusSchema,
  // Which calendar this model's type year spans are written in. Required on
  // create with no default: a model that doesn't say produces year spans nobody
  // can read correctly. See lib/year.ts.
  yearCalendar: yearCalendarSchema,
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
