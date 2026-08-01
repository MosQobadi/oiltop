import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
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

export const fitmentInquiryListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: fitmentInquiryStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export type FitmentInquiryListQuery = z.infer<
  typeof fitmentInquiryListQuerySchema
>;

export const fitmentInquiryPatchSchema = z
  .object({
    status: fitmentInquiryStatusSchema,
    adminNote: z.string().max(2000),
  })
  .partial()
  .refine((data) => data.status !== undefined || data.adminNote !== undefined, {
    message: "At least one of status or adminNote must be provided",
  });
export type FitmentInquiryPatchInput = z.infer<
  typeof fitmentInquiryPatchSchema
>;
