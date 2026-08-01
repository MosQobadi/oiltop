import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { orderStatusSchema, paymentStatusSchema } from "./enums";

export const orderListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: orderStatusSchema.optional(),
  payment: paymentStatusSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const orderStatusUpdateSchema = z.object({
  status: orderStatusSchema,
});

export const orderNoteSchema = z.object({
  adminNote: z.string().min(1).max(2000),
});

export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;
