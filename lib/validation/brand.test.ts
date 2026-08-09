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

  it("accepts a missing slug (auto-generated at the service layer)", () => {
    const withoutSlug: Partial<typeof validBrand> = { ...validBrand };
    delete withoutSlug.slug;
    const result = brandCreateSchema.safeParse(withoutSlug);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = brandCreateSchema.safeParse({
      ...validBrand,
      status: "DELETED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const invalid: Partial<typeof validBrand> = { ...validBrand };
    delete invalid.nameEn;
    const result = brandCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("brandUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(brandUpdateSchema.safeParse({ status: "INACTIVE" }).success).toBe(true);
  });

  it("rejects an invalid slug", () => {
    const result = brandUpdateSchema.safeParse({ slug: "Not A Slug!" });
    expect(result.success).toBe(false);
  });
});
