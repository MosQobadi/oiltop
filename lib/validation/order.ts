import { z } from "zod";
import { orderStatusSchema } from "./enums";

export const orderStatusUpdateSchema = z.object({
  status: orderStatusSchema,
});

export const orderNoteSchema = z.object({
  adminNote: z.string().min(1).max(2000),
});

export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;
