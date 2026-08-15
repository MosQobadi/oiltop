import { describe, expect, it } from "vitest";
import { carBrandCreateSchema, carBrandUpdateSchema } from "./carBrand";

const validCarBrand = {
  slug: "toyota",
  nameEn: "Toyota",
  nameFa: "تویوتا",
  status: "ACTIVE",
};

describe("carBrandCreateSchema", () => {
  it("accepts a valid car brand", () => {
    expect(carBrandCreateSchema.safeParse(validCarBrand).success).toBe(true);
  });

  it("rejects an invalid slug", () => {
    const result = carBrandCreateSchema.safeParse({
      ...validCarBrand,
      slug: "Toyota Cars",
    });
    expect(result.success).toBe(false);
  });
});

describe("carBrandUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(carBrandUpdateSchema.safeParse({ nameEn: "Toyota Motor" }).success).toBe(true);
  });

  // A null logo is the form's "Remove" button; without it the PATCH could only
  // say "leave the logo alone", never "clear it".
  it("accepts a null logo, so it can be cleared", () => {
    const result = carBrandUpdateSchema.safeParse({ logo: null });
    expect(result.success).toBe(true);
    expect(result.data?.logo).toBeNull();
  });

  it("still rejects an empty-string logo", () => {
    expect(carBrandUpdateSchema.safeParse({ logo: "" }).success).toBe(false);
  });
});
