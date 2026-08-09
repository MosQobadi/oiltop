import type { UserRole } from "@/lib/auth/jwt";

// The current user shape returned to the client — never includes passwordHash.
// `email` is nullable because a storefront CUSTOMER can register with only a
// phone number (Design Decision 7); an ADMIN always has one, so it is never
// null for anyone who can reach the admin panel.
export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
}
