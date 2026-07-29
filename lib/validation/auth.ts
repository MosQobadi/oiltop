import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
