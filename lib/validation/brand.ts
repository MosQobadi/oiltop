import { z } from "zod";
import { slugSchema } from "./common";
import { brandStatusSchema } from "./enums";

const brandShape = {
  slug: slugSchema,
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  logo: z.string().min(1).optional(),
  status: brandStatusSchema,
};

export const brandCreateSchema = z.object(brandShape);
export const brandUpdateSchema = z.object(brandShape).partial();

export type BrandCreateInput = z.infer<typeof brandCreateSchema>;
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;
