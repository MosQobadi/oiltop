import { z } from "zod";
import { userRoleSchema } from "./enums";

// One login route serves both the admin panel and the storefront, so the
// credential is a single free-form `identifier` rather than an `email`: an
// admin types the email they always have, a customer types the phone they
// registered with (or an email, if they added one). Which of the two it is is
// `loginIdentifierKind`'s job in lib/auth/identifier.ts — validating the shape
// here would only turn a wrong credential into a different 4xx, and the two
// formats have no common shape worth asserting anyway.
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or phone number is required").max(150),
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
