import { z } from "zod";
import { userRoleSchema } from "./enums";

// Admin panel login. Admins always have an email, so this stays email-only —
// the storefront's phone-or-email login is a separate schema (Phase 10).
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;

// `User.email` and `User.phone` are both nullable columns because admins and
// storefront customers identify differently (Design Decision 7). This is the
// application-level rule that replaces the NOT NULL the email column used to
// carry: an ADMIN must have an email, a CUSTOMER must have a phone. Keeping it
// in Zod rather than in a DB constraint means the two roles can share one table
// and the rule can be relaxed later without a migration — the same reasoning as
// the FitmentProfileItem.climate rule.
export const userIdentifiersSchema = z
  .object({
    role: userRoleSchema,
    email: z.string().trim().email("Invalid email address").max(150).optional(),
    phone: z.string().trim().min(6).max(30).optional(),
  })
  .refine((data) => data.role !== "ADMIN" || !!data.email, {
    message: "email is required for admin accounts",
    path: ["email"],
  })
  .refine((data) => data.role !== "CUSTOMER" || !!data.phone, {
    message: "phone is required for customer accounts",
    path: ["phone"],
  });

export type UserIdentifiersInput = z.infer<typeof userIdentifiersSchema>;
