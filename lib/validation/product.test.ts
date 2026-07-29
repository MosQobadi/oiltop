import { describe, expect, it } from "vitest";
import { productCreateSchema, productUpdateSchema } from "./product";

const validProduct = {
  sku: "SKU-001",
  nameEn: "5W-30 Fully Synthetic",
  nameFa: "روغن موتور تمام سنتتیک",
  categoryId: "cat_1",
  brandId: "brand_1",
  price: 25.5,
  discountPercent: 10,
  shortDescriptionEn: "Short description",
  shortDescriptionFa: "توضیح کوتاه",
  longDescriptionEn: "Long description",
  longDescriptionFa: "توضیح بلند",
  status: "ACTIVE",
};

describe("productCreateSchema", () => {
  it("accepts a valid product", () => {
    expect(productCreateSchema.safeParse(validProduct).success).toBe(true);
  });

  it("rejects a negative price", () => {
    const result = productCreateSchema.safeParse({
      ...validProduct,
      price: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a discountPercent outside 0-100", () => {
    const result = productCreateSchema.safeParse({
      ...validProduct,
      discountPercent: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe("productUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(productUpdateSchema.safeParse({ price: 30 }).success).toBe(true);
  });
});
