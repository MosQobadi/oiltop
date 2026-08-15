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

describe("productCreateSchema defaults", () => {
  it("fills in discountPercent, tags, and oemPartNumbers", () => {
    const result = productCreateSchema.parse({
      ...validProduct,
      discountPercent: undefined,
    });

    expect(result.discountPercent).toBe(0);
    expect(result.tags).toEqual([]);
    expect(result.oemPartNumbers).toEqual([]);
  });
});

describe("productCreateSchema spec columns", () => {
  it("accepts a product with no specs at all", () => {
    const result = productCreateSchema.parse(validProduct);

    expect(result.viscosity).toBeUndefined();
    expect(result.apiGrade).toBeUndefined();
    expect(result.volumeMl).toBeUndefined();
  });

  it("uppercases and trims viscosity and apiGrade", () => {
    const result = productCreateSchema.parse({
      ...validProduct,
      viscosity: " 5w-30 ",
      apiGrade: " sn ",
    });

    expect(result.viscosity).toBe("5W-30");
    expect(result.apiGrade).toBe("SN");
  });

  it.each(["5W-30", "5W30", "5W 30", "0w20", "40"])("accepts %s as a viscosity", (viscosity) => {
    expect(productCreateSchema.safeParse({ ...validProduct, viscosity }).success).toBe(true);
  });

  it.each(["fully synthetic", "5W-30 or 10W-40", "W30", ""])(
    "rejects %s as a viscosity",
    (viscosity) => {
      expect(productCreateSchema.safeParse({ ...validProduct, viscosity }).success).toBe(false);
    },
  );

  it("rejects a volumeMl that isn't a positive whole number", () => {
    expect(productCreateSchema.safeParse({ ...validProduct, volumeMl: 0 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...validProduct, volumeMl: 4.5 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...validProduct, volumeMl: 4000 }).success).toBe(true);
  });

  it("accepts null for each spec — that is how the form clears one", () => {
    const result = productUpdateSchema.parse({
      viscosity: null,
      apiGrade: null,
      volumeMl: null,
    });

    expect(result).toEqual({ viscosity: null, apiGrade: null, volumeMl: null });
  });

  it("takes specs as an object and nothing else", () => {
    expect(
      productCreateSchema.safeParse({ ...validProduct, specs: { baseOil: "Group III" } }).success,
    ).toBe(true);
    expect(productCreateSchema.safeParse({ ...validProduct, specs: "Group III" }).success).toBe(
      false,
    );
  });
});

describe("productUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(productUpdateSchema.safeParse({ price: 30 }).success).toBe(true);
  });

  // A default that survives `.partial()` turns "rename this product" into
  // "rename it and zero its discount and wipe its tags".
  it("leaves omitted defaulted fields out of the parsed update", () => {
    const result = productUpdateSchema.parse({ nameEn: "Renamed" });

    expect(result).toEqual({ nameEn: "Renamed" });
  });

  it("still validates the defaulted fields when they are supplied", () => {
    expect(productUpdateSchema.safeParse({ discountPercent: 150 }).success).toBe(false);
  });

  // A null image is the form's "Remove" button; an absent key still means
  // "leave the photo alone".
  it("clears the image when it is explicitly nulled", () => {
    expect(productUpdateSchema.parse({ image: null })).toEqual({ image: null });
    expect(productUpdateSchema.parse({ nameEn: "Renamed" })).not.toHaveProperty("image");
  });

  it("still rejects an empty-string image", () => {
    expect(productUpdateSchema.safeParse({ image: "" }).success).toBe(false);
  });
});
