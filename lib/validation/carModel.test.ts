import { describe, expect, it } from "vitest";
import { carModelCreateSchema, carModelUpdateSchema } from "./carModel";

const validCarModel = {
  carBrandId: "carbrand_1",
  nameEn: "Corolla",
  nameFa: "کرولا",
  slug: "corolla",
  status: "ACTIVE",
  yearCalendar: "GREGORIAN",
};

describe("carModelCreateSchema", () => {
  it("accepts a valid car model", () => {
    expect(carModelCreateSchema.safeParse(validCarModel).success).toBe(true);
  });

  // Required with no default: a model that doesn't say which calendar its years
  // are in produces spans nobody can read correctly.
  it("rejects a car model with no year calendar", () => {
    const withoutCalendar: Record<string, unknown> = { ...validCarModel };
    delete withoutCalendar.yearCalendar;
    expect(carModelCreateSchema.safeParse(withoutCalendar).success).toBe(false);
  });

  it("rejects an unknown year calendar", () => {
    expect(
      carModelCreateSchema.safeParse({ ...validCarModel, yearCalendar: "HIJRI" }).success,
    ).toBe(false);
  });

  it("rejects a missing carBrandId", () => {
    const invalid: Partial<typeof validCarModel> = { ...validCarModel };
    delete invalid.carBrandId;
    const result = carModelCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("carModelUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(carModelUpdateSchema.safeParse({ nameEn: "Corolla Cross" }).success).toBe(true);
  });

  // A null image is the form's "Remove" button; without it the PATCH could only
  // say "leave the photo alone", never "clear it".
  it("accepts a null image, so the photo can be cleared", () => {
    const result = carModelUpdateSchema.safeParse({ image: null });
    expect(result.success).toBe(true);
    expect(result.data?.image).toBeNull();
  });

  it("still rejects an empty-string image", () => {
    expect(carModelUpdateSchema.safeParse({ image: "" }).success).toBe(false);
  });
});
