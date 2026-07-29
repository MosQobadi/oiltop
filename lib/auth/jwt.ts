import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// Mirrors the UserRole enum in prisma/schema.prisma. Kept as a plain literal
// type (not imported from lib/generated/prisma) so this module doesn't depend
// on generated output — see lib/validation/enums.ts for the same rationale.
export type UserRole = "ADMIN" | "CUSTOMER";

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

const TOKEN_EXPIRY = "7d";

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey());
  return toTokenPayload(payload);
}

function toTokenPayload(payload: JWTPayload): TokenPayload {
  return {
    userId: payload.userId as string,
    role: payload.role as UserRole,
  };
}
