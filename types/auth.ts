import type { UserRole } from "@/lib/auth/jwt";

// The current user shape returned to the client — never includes passwordHash.
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}
