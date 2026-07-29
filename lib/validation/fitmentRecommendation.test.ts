import { describe, expect, it } from "vitest";
import {
  fitmentRecommendationCreateSchema,
  fitmentRecommendationUpdateSchema,
} from "./fitmentRecommendation";

const validFitment = {
  carEngineId: "engine_1",
  categoryId: "cat_1",
  categoryPartType: "ENGINE_OIL",
  climate: "HOT",
  productId: "product_1",
};

describe("fitmentRecommendationCreateSchema", () => {
  it("accepts a valid fitment recommendation", () => {
    expect(
      fitmentRecommendationCreateSchema.safeParse(validFitment).success,
    ).toBe(true);
  });

  it("rejects a missing categoryId", () => {
    const invalid: Partial<typeof validFitment> = { ...validFitment };
    delete invalid.categoryId;
    expect(fitmentRecommendationCreateSchema.safeParse(invalid).success).toBe(
      false,
    );
  });

  it("rejects climate other than STANDARD when category is not ENGINE_OIL", () => {
    const result = fitmentRecommendationCreateSchema.safeParse({
      ...validFitment,
      categoryPartType: "FILTER",
      climate: "HOT",
    });
    expect(result.success).toBe(false);
  });

  it("accepts climate STANDARD when category is not ENGINE_OIL", () => {
    const result = fitmentRecommendationCreateSchema.safeParse({
      ...validFitment,
      categoryPartType: "FILTER",
      climate: "STANDARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither productId nor specNote is present", () => {
    const rest: Partial<typeof validFitment> = { ...validFitment };
    delete rest.productId;
    expect(fitmentRecommendationCreateSchema.safeParse(rest).success).toBe(
      false,
    );
  });

  it("accepts specNote alone as the target", () => {
    const rest: Partial<typeof validFitment> = { ...validFitment };
    delete rest.productId;
    const result = fitmentRecommendationCreateSchema.safeParse({
      ...rest,
      specNote: "Use manufacturer-specified 0W-20",
    });
    expect(result.success).toBe(true);
  });
});

describe("fitmentRecommendationUpdateSchema", () => {
  it("accepts a partial update that only touches priority", () => {
    expect(
      fitmentRecommendationUpdateSchema.safeParse({ priority: 5 }).success,
    ).toBe(true);
  });

  it("rejects climate other than STANDARD when category is not ENGINE_OIL", () => {
    const result = fitmentRecommendationUpdateSchema.safeParse({
      categoryPartType: "FILTER",
      climate: "COLD",
    });
    expect(result.success).toBe(false);
  });
});
