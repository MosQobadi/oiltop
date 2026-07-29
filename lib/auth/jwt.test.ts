import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { signToken, verifyToken, type TokenPayload } from "./jwt";

const TEST_SECRET = "test-secret-for-unit-tests";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

const payload: TokenPayload = { userId: "user_123", role: "ADMIN" };

describe("signToken / verifyToken", () => {
  it("signs a token and verifies it back to the original payload", async () => {
    const token = await signToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).toEqual(payload);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken(payload);
    process.env.JWT_SECRET = "a-different-secret";
    await expect(verifyToken(token)).rejects.toThrow();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it("rejects an expired token", async () => {
    const secretKey = new TextEncoder().encode(TEST_SECRET);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expiredToken = await new SignJWT({
      userId: payload.userId,
      role: payload.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(nowInSeconds - 60 * 60 * 24 * 8)
      .setExpirationTime(nowInSeconds - 60 * 60 * 24)
      .sign(secretKey);

    await expect(verifyToken(expiredToken)).rejects.toThrow();
  });
});
