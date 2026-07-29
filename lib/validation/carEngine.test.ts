import { describe, expect, it } from "vitest";
import { carEngineCreateSchema, carEngineUpdateSchema } from "./carEngine";

const validCarEngine = {
  carModelId: "carmodel_1",
  labelEn: "1.8L Petrol",
  labelFa: "بنزینی ۱.۸ لیتر",
  yearStart: 2015,
  yearEnd: 2020,
  fuelType: "PETROL",
  status: "ACTIVE",
};

describe("carEngineCreateSchema", () => {
  it("accepts a valid car engine", () => {
    expect(carEngineCreateSchema.safeParse(validCarEngine).success).toBe(true);
  });

  it("accepts a null-ended yearEnd (still in production)", () => {
    const rest: Partial<typeof validCarEngine> = { ...validCarEngine };
    delete rest.yearEnd;
    expect(carEngineCreateSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects an invalid fuelType", () => {
    const result = carEngineCreateSchema.safeParse({
      ...validCarEngine,
      fuelType: "STEAM",
    });
    expect(result.success).toBe(false);
  });

  it("rejects yearStart greater than yearEnd", () => {
    const result = carEngineCreateSchema.safeParse({
      ...validCarEngine,
      yearStart: 2022,
      yearEnd: 2020,
    });
    expect(result.success).toBe(false);
  });
});

describe("carEngineUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(
      carEngineUpdateSchema.safeParse({ engineCode: "2ZR-FE" }).success,
    ).toBe(true);
  });

  it("rejects yearStart greater than yearEnd on partial update", () => {
    const result = carEngineUpdateSchema.safeParse({
      yearStart: 2022,
      yearEnd: 2020,
    });
    expect(result.success).toBe(false);
  });
});
