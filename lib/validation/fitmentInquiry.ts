import { z } from "zod";
import { fitmentInquiryStatusSchema } from "./enums";

const fitmentInquiryShape = {
  carEngineId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  customerName: z.string().min(1).max(150),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional(),
  message: z.string().max(2000).optional(),
  status: fitmentInquiryStatusSchema,
  adminNote: z.string().max(2000).optional(),
};

export const fitmentInquiryCreateSchema = z.object(fitmentInquiryShape);
export const fitmentInquiryUpdateSchema = z
  .object(fitmentInquiryShape)
  .partial();

export type FitmentInquiryCreateInput = z.infer<
  typeof fitmentInquiryCreateSchema
>;
export type FitmentInquiryUpdateInput = z.infer<
  typeof fitmentInquiryUpdateSchema
>;
