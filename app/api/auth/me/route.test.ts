import "dotenv/config";
import { SignJWT } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

let adminUserId: string;

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  adminUserId = admin.id;
});

beforeEach(() => {
  cookieJar.clear();
});

async function signValidToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function signExpiredToken(userId: string) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowInSeconds - 60 * 60 * 24 * 8)
    .setExpirationTime(nowInSeconds - 60 * 60 * 24)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

describe("GET /api/auth/me", () => {
  it("returns the current user for a valid token", async () => {
    cookieJar.set(
      process.env.COOKIE_NAME!,
      await signValidToken(adminUserId),
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe("admin@topoil.com");
    expect(json.data.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 when there is no token", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("returns 401 for an expired token", async () => {
    cookieJar.set(
      process.env.COOKIE_NAME!,
      await signExpiredToken(adminUserId),
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });
});
