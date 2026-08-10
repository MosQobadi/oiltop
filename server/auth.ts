import { prisma } from "@/lib/db";
import { getAuthCookie } from "@/lib/auth/cookies";
import { loginIdentifierKind, normalizePhone } from "@/lib/auth/identifier";
import { signToken, verifyToken, type UserRole } from "@/lib/auth/jwt";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { StorefrontRegisterInput } from "@/lib/validation";
import type { AuthUser } from "@/types/auth";

export class AuthError extends Error {}

// A separate class only so the register route can answer 409 instead of 401 —
// "that number is already registered" is a different situation from "those
// credentials are wrong", and the customer's next step differs too.
export class DuplicateIdentifierError extends AuthError {}

// Right credentials, unusable account. Separate from a plain AuthError so the
// login route can answer 403 rather than 401 and the storefront form can say
// "call us" instead of "check your password" — retyping a correct password is
// a dead end.
export class AccountDeactivatedError extends AuthError {}

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

// Role-agnostic on purpose: the storefront and the admin panel share one
// session (design brief Section 6), so this only answers "are these the right
// credentials for a usable account". Keeping ADMIN out of the admin panel is
// `proxy.ts` for navigation and `requireAdmin()` below for every route handler
// that touches admin data — a customer who authenticates here gets a perfectly
// valid session that simply opens no admin door.
export async function authenticate(
  identifier: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const user =
    loginIdentifierKind(identifier) === "email"
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { phone: normalizePhone(identifier) } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid credentials");
  }
  // What the admin Customers screen's activate/deactivate toggle actually
  // does — without this it would change a badge and nothing else.
  if (user.status !== "ACTIVE") {
    throw new AccountDeactivatedError("This account has been deactivated");
  }

  const token = await signToken({ userId: user.id, role: user.role });
  return { user: toAuthUser(user), token };
}

// Storefront sign-up. Always CUSTOMER and always ACTIVE: the role and status
// are the server's to decide, which is why neither appears in
// `storefrontRegisterSchema`. The new account is signed straight in, so the
// customer who just typed a password doesn't immediately type it again.
export async function registerCustomer(
  input: StorefrontRegisterInput,
): Promise<{ user: AuthUser; token: string }> {
  // Stored normalized so login can find it back from any spacing the customer
  // uses next time — see normalizePhone.
  const phone = normalizePhone(input.phone);

  const phoneTaken = await prisma.user.findUnique({ where: { phone } });
  if (phoneTaken) {
    throw new DuplicateIdentifierError("An account with this phone number already exists");
  }
  if (input.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: input.email } });
    if (emailTaken) {
      throw new DuplicateIdentifierError("An account with this email address already exists");
    }
  }

  const user = await prisma.user.create({
    data: {
      phone,
      email: input.email ?? null,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });

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
