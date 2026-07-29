import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(
      loginSchema.safeParse({
        email: "admin@topoil.com",
        password: "password123",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "password123" })
        .success,
    ).toBe(false);
  });

  it("rejects a too-short password", () => {
    expect(
      loginSchema.safeParse({ email: "admin@topoil.com", password: "short" })
        .success,
    ).toBe(false);
  });
});
