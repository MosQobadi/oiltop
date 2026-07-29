import { z } from "zod";
import { slugSchema } from "./common";
import { carModelStatusSchema } from "./enums";

const carModelShape = {
  carBrandId: z.string().min(1, "carBrandId is required"),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  slug: slugSchema,
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
