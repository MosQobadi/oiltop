import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { userStatusSchema } from "./enums";

export const customerListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: userStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerStatusSchema = z.object({
  status: userStatusSchema,
});

export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;
