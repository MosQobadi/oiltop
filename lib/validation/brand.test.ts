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

  it("leaves sortOrder null when it is omitted — unordered, not first", () => {
    expect(brandCreateSchema.parse(validBrand).sortOrder).toBeNull();
  });

  it("rejects a fractional or negative sortOrder", () => {
    expect(brandCreateSchema.safeParse({ ...validBrand, sortOrder: 1.5 }).success).toBe(false);
    expect(brandCreateSchema.safeParse({ ...validBrand, sortOrder: -1 }).success).toBe(false);
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

  // A surviving default would send every renamed brand back to the front of the
  // storefront list.
  it("leaves sortOrder alone when it is not part of the update", () => {
    expect(brandUpdateSchema.parse({ nameEn: "Updated name" })).not.toHaveProperty("sortOrder");
    expect(brandUpdateSchema.parse({ sortOrder: 3 })).toEqual({ sortOrder: 3 });
  });

  it("unpins a brand when sortOrder is explicitly cleared", () => {
    expect(brandUpdateSchema.parse({ sortOrder: null })).toEqual({ sortOrder: null });
  });

  // Same shape as sortOrder above: null clears, an absent key leaves it alone.
  it("clears the logo when it is explicitly nulled", () => {
    expect(brandUpdateSchema.parse({ logo: null })).toEqual({ logo: null });
    expect(brandUpdateSchema.parse({ nameEn: "Updated name" })).not.toHaveProperty("logo");
  });

  it("still rejects an empty-string logo", () => {
    expect(brandUpdateSchema.safeParse({ logo: "" }).success).toBe(false);
  });
});
