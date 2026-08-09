import { describe, expect, it } from "vitest";
import { storefrontRegisterSchema } from "./storefront";

// The register route itself is Phase 10 work; the schema lands here with
// Task 0.6 because it is the application-level rule that replaces the NOT NULL
// that User.email used to carry.
const validRegistration = {
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+989121234567",
  password: "password123",
};

describe("storefrontRegisterSchema", () => {
  it("accepts a registration with a phone and no email", () => {
    const result = storefrontRegisterSchema.safeParse(validRegistration);

    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
  });

  it("accepts a registration with both a phone and an email", () => {
    const result = storefrontRegisterSchema.safeParse({
      ...validRegistration,
      email: "ada@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("ada@example.com");
  });

  it("treats a blank email as not provided", () => {
    const result = storefrontRegisterSchema.safeParse({
      ...validRegistration,
      email: "   ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
  });

  it("rejects a registration without a phone", () => {
    const result = storefrontRegisterSchema.safeParse({
      firstName: validRegistration.firstName,
      lastName: validRegistration.lastName,
      password: validRegistration.password,
      email: "ada@example.com",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["phone"]);
  });

  it("rejects a phone that isn't phone-shaped", () => {
    expect(
      storefrontRegisterSchema.safeParse({
        ...validRegistration,
        phone: "not a phone",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed email when one is given", () => {
    expect(
      storefrontRegisterSchema.safeParse({
        ...validRegistration,
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("rejects a too-short password", () => {
    expect(
      storefrontRegisterSchema.safeParse({
        ...validRegistration,
        password: "short",
      }).success,
    ).toBe(false);
  });
});
