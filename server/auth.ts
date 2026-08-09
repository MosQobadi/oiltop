import { prisma } from "@/lib/db";
import { getAuthCookie } from "@/lib/auth/cookies";
import { signToken, verifyToken, type UserRole } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import type { AuthUser } from "@/types/auth";

export class AuthError extends Error {}

function toAuthUser(user: {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as UserRole,
  };
}

export async function authenticateAdmin(
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  if (user.role !== "ADMIN") {
    throw new AuthError("Only administrators can access this panel");
  }

  const token = await signToken({ userId: user.id, role: user.role });
  return { user: toAuthUser(user), token };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAuthCookie();
  if (!token) return null;

  try {
    const { userId } = await verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user ? toAuthUser(user) : null;
  } catch {
    return null;
  }
}

// Re-verifies the JWT and role inside the route handler itself — proxy.ts
// only guards page navigation (`/admin/:path*`), not the `/api/admin/*`
// route handlers, so every one of those must call this directly.
export async function requireAdmin(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new AuthError("Not authenticated");
  }
  return user;
}
