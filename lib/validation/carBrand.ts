import { z } from "zod";
import { slugSchema } from "./common";
import { carBrandStatusSchema } from "./enums";

const carBrandShape = {
  slug: slugSchema,
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  logo: z.string().min(1).optional(),
  status: carBrandStatusSchema,
};

export const carBrandCreateSchema = z.object(carBrandShape);
export const carBrandUpdateSchema = z.object(carBrandShape).partial();

export type CarBrandCreateInput = z.infer<typeof carBrandCreateSchema>;
export type CarBrandUpdateInput = z.infer<typeof carBrandUpdateSchema>;
