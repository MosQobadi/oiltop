import { describe, expect, it } from "vitest";
import {
  carFinderEngineQuerySchema,
  storefrontProfileUpdateSchema,
  storefrontRegisterSchema,
} from "./storefront";

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

const validProfile = {
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+989121234567",
  email: "ada@example.com",
};

describe("storefrontProfileUpdateSchema", () => {
  it("accepts the four fields a customer may edit", () => {
    const result = storefrontProfileUpdateSchema.safeParse(validProfile);

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("ada@example.com");
  });

  it("reads a blank email as cleared rather than rejecting it", () => {
    const result = storefrontProfileUpdateSchema.safeParse({ ...validProfile, email: "  " });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
  });

  it("still requires a phone — a customer with neither identifier can't sign in", () => {
    const result = storefrontProfileUpdateSchema.safeParse({
      firstName: validProfile.firstName,
      lastName: validProfile.lastName,
      email: validProfile.email,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["phone"]);
  });

  it("applies the register schema's own limits to the fields it reuses", () => {
    expect(
      storefrontProfileUpdateSchema.safeParse({ ...validProfile, phone: "not a phone" }).success,
    ).toBe(false);
    expect(
      storefrontProfileUpdateSchema.safeParse({ ...validProfile, firstName: "  " }).success,
    ).toBe(false);
    expect(
      storefrontProfileUpdateSchema.safeParse({ ...validProfile, email: "not-an-email" }).success,
    ).toBe(false);
  });

  // A password change is its own flow with the current password, and role and
  // status are the server's — none of the three may ride in on a profile save.
  it("drops password, role and status rather than passing them through", () => {
    const result = storefrontProfileUpdateSchema.safeParse({
      ...validProfile,
      password: "password123",
      role: "ADMIN",
      status: "INACTIVE",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("password");
    expect(result.data).not.toHaveProperty("role");
    expect(result.data).not.toHaveProperty("status");
  });
});

describe("carFinderEngineQuerySchema", () => {
  // The year arriving here is whatever the previous step offered, and that step
  // lists a car's years in its OWN calendar. Bounded at 1900-2100, the finder
  // offered a Peugeot 206 the years 1386-1401 and then rejected every one of
  // them with a 400 — the storefront could not serve a single Iranian car.
  it("accepts a Jalali year", () => {
    expect(carFinderEngineQuerySchema.safeParse({ year: "1395" }).success).toBe(true);
    expect(carFinderEngineQuerySchema.safeParse({ year: "1401" }).success).toBe(true);
  });

  it("still accepts a Gregorian year", () => {
    expect(carFinderEngineQuerySchema.safeParse({ year: "2018" }).success).toBe(true);
  });

  it("rejects a number that is no year in either calendar", () => {
    expect(carFinderEngineQuerySchema.safeParse({ year: "42" }).success).toBe(false);
    expect(carFinderEngineQuerySchema.safeParse({ year: "9999" }).success).toBe(false);
  });

  it("still requires a year", () => {
    expect(carFinderEngineQuerySchema.safeParse({}).success).toBe(false);
  });
});
