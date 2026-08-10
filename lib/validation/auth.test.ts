import { describe, expect, it } from "vitest";
import { loginSchema, userIdentifiersSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts an email identifier", () => {
    expect(
      loginSchema.safeParse({
        identifier: "admin@topoil.com",
        password: "password123",
      }).success,
    ).toBe(true);
  });

  it("accepts a phone identifier", () => {
    expect(
      loginSchema.safeParse({
        identifier: "0912 445 8890",
        password: "password123",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty identifier", () => {
    expect(loginSchema.safeParse({ identifier: "   ", password: "password123" }).success).toBe(
      false,
    );
  });

  it("rejects a too-short password", () => {
    expect(
      loginSchema.safeParse({ identifier: "admin@topoil.com", password: "short" }).success,
    ).toBe(false);
  });
});

describe("userIdentifiersSchema", () => {
  it("requires an email for an admin", () => {
    const result = userIdentifiersSchema.safeParse({
      role: "ADMIN",
      phone: "+989120000000",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["email"]);
  });

  it("accepts an admin with an email and no phone", () => {
    expect(
      userIdentifiersSchema.safeParse({
        role: "ADMIN",
        email: "admin@topoil.com",
      }).success,
    ).toBe(true);
  });

  it("requires a phone for a customer", () => {
    const result = userIdentifiersSchema.safeParse({
      role: "CUSTOMER",
      email: "customer@example.com",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["phone"]);
  });

  it("accepts a customer with a phone and no email", () => {
    expect(
      userIdentifiersSchema.safeParse({
        role: "CUSTOMER",
        phone: "+989121234567",
      }).success,
    ).toBe(true);
  });
});
