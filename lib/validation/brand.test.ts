import { describe, expect, it } from "vitest";
import { brandCreateSchema, brandUpdateSchema } from "./brand";

const validBrand = {
  slug: "castrol",
  nameEn: "Castrol",
  nameFa: "کاسترول",
  status: "ACTIVE",
};

describe("brandCreateSchema", () => {
  it("accepts a valid brand", () => {
    expect(brandCreateSchema.safeParse(validBrand).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = brandCreateSchema.safeParse({
      ...validBrand,
      status: "DELETED",
    });
    expect(result.success).toBe(false);
  });
});

describe("brandUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(brandUpdateSchema.safeParse({ status: "INACTIVE" }).success).toBe(
      true,
    );
  });
});
