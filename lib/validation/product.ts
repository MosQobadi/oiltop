import { z } from "zod";
import { productStatusSchema } from "./enums";

const productShape = {
  sku: z.string().min(1).max(64),
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  categoryId: z.string().min(1, "categoryId is required"),
  brandId: z.string().min(1, "brandId is required"),
  price: z.number().nonnegative("price must be >= 0"),
  discountPercent: z.number().int().min(0).max(100).default(0),
  tags: z.array(z.string().min(1).max(50)).default([]),
  oemPartNumbers: z.array(z.string().min(1).max(50)).default([]),
  shortDescriptionEn: z.string().min(1).max(500),
  shortDescriptionFa: z.string().min(1).max(500),
  longDescriptionEn: z.string().min(1).max(5000),
  longDescriptionFa: z.string().min(1).max(5000),
  metaTitleEn: z.string().max(70).optional(),
  metaTitleFa: z.string().max(70).optional(),
  metaDescriptionEn: z.string().max(160).optional(),
  metaDescriptionFa: z.string().max(160).optional(),
  image: z.string().min(1).optional(),
  status: productStatusSchema,
};

export const productCreateSchema = z.object(productShape);
export const productUpdateSchema = z.object(productShape).partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
