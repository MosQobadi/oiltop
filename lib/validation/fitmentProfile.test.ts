import { describe, expect, it } from "vitest";
import {
  fitmentProfileItemCreateSchema,
  fitmentProfileItemUpdateSchema,
} from "./fitmentProfile";

const validItem = {
  categoryId: "cat_1",
  categoryPartType: "ENGINE_OIL",
  productId: "prod_1",
};

describe("fitmentProfileItemCreateSchema", () => {
  it("accepts a valid item", () => {
    expect(fitmentProfileItemCreateSchema.safeParse(validItem).success).toBe(true);
  });

  it("fills in climate and priority when they are omitted", () => {
    const result = fitmentProfileItemCreateSchema.parse(validItem);

    expect(result.climate).toBe("STANDARD");
    expect(result.priority).toBe(0);
  });

  it("rejects a non-STANDARD climate on a non-oil category", () => {
    const result = fitmentProfileItemCreateSchema.safeParse({
      ...validItem,
      categoryPartType: "FILTER",
      climate: "HOT",
    });

    expect(result.success).toBe(false);
  });

  it("requires a productId or a specNote", () => {
    expect(
      fitmentProfileItemCreateSchema.safeParse({
        categoryId: "cat_1",
        categoryPartType: "ENGINE_OIL",
      }).success,
    ).toBe(false);
  });
});

describe("fitmentProfileItemUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(
      fitmentProfileItemUpdateSchema.safeParse({ adminNote: "Checked" }).success,
    ).toBe(true);
  });

  // A default that survives `.partial()` turns "add a note to this item" into
  // "add a note, knock the climate back to STANDARD, and reorder it to 0".
  it("leaves omitted defaulted fields out of the parsed update", () => {
    const result = fitmentProfileItemUpdateSchema.parse({ adminNote: "Checked" });

    expect(result).toEqual({ adminNote: "Checked" });
  });

  it("still validates climate and priority when they are supplied", () => {
    expect(
      fitmentProfileItemUpdateSchema.safeParse({ climate: "TROPICAL" }).success,
    ).toBe(false);
    expect(
      fitmentProfileItemUpdateSchema.safeParse({ priority: 1.5 }).success,
    ).toBe(false);
    expect(
      fitmentProfileItemUpdateSchema.safeParse({ climate: "HOT", priority: 2 })
        .success,
    ).toBe(true);
  });

  it("still applies the climate/partType rule to a supplied climate", () => {
    expect(
      fitmentProfileItemUpdateSchema.safeParse({
        categoryPartType: "FILTER",
        climate: "COLD",
      }).success,
    ).toBe(false);
  });

  it("keeps an explicit priority of 0", () => {
    expect(fitmentProfileItemUpdateSchema.parse({ priority: 0 })).toEqual({
      priority: 0,
    });
  });
});
