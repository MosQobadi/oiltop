import { z } from "zod";
import { userStatusSchema } from "./enums";

export const customerStatusSchema = z.object({
  status: userStatusSchema,
});

export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;
