import { describe, expect, it } from "vitest";
import { categoryCreateSchema, categoryUpdateSchema } from "./category";

const validCategory = {
  slug: "engine-oil",
  nameEn: "Engine Oil",
  nameFa: "روغن موتور",
  tags: ["oil"],
  shortDescriptionEn: "Short description",
  shortDescriptionFa: "توضیح کوتاه",
  longDescriptionEn: "Long description",
  longDescriptionFa: "توضیح بلند",
  status: "ACTIVE",
  partType: "ENGINE_OIL",
};

describe("categoryCreateSchema", () => {
  it("accepts a valid category", () => {
    const result = categoryCreateSchema.safeParse(validCategory);
    expect(result.success).toBe(true);
  });

  it("accepts a missing slug (auto-generated at the service layer)", () => {
    const withoutSlug: Partial<typeof validCategory> = { ...validCategory };
    delete withoutSlug.slug;
    const result = categoryCreateSchema.safeParse(withoutSlug);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const invalid: Partial<typeof validCategory> = { ...validCategory };
    delete invalid.nameEn;
    const result = categoryCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("takes a FILTER category without asking which kind of filter it is", () => {
    // Which filter it is *is* the category — there is no second field to keep
    // in step with it.
    const result = categoryCreateSchema.safeParse({ ...validCategory, partType: "FILTER" });
    expect(result.success).toBe(true);
  });

  it("rejects a partType outside the enum", () => {
    const result = categoryCreateSchema.safeParse({ ...validCategory, partType: "OIL_FILTER" });
    expect(result.success).toBe(false);
  });
});

describe("categoryCreateSchema defaults", () => {
  it("fills in tags when they are omitted", () => {
    const withoutTags: Partial<typeof validCategory> = { ...validCategory };
    delete withoutTags.tags;

    expect(categoryCreateSchema.parse(withoutTags).tags).toEqual([]);
  });

  it("leaves sortOrder null when it is omitted — unordered, not first", () => {
    expect(categoryCreateSchema.parse(validCategory).sortOrder).toBeNull();
  });

  it("rejects a fractional or negative sortOrder", () => {
    expect(categoryCreateSchema.safeParse({ ...validCategory, sortOrder: 1.5 }).success).toBe(
      false,
    );
    expect(categoryCreateSchema.safeParse({ ...validCategory, sortOrder: -1 }).success).toBe(false);
  });
});

describe("categoryUpdateSchema", () => {
  it("accepts a partial update", () => {
    const result = categoryUpdateSchema.safeParse({ nameEn: "Updated name" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid slug", () => {
    const result = categoryUpdateSchema.safeParse({ slug: "Not A Slug!" });
    expect(result.success).toBe(false);
  });

  // A default that survives `.partial()` turns "rename this category" into
  // "rename it and clear its tags".
  it("leaves omitted defaulted fields out of the parsed update", () => {
    const result = categoryUpdateSchema.parse({ nameEn: "Updated name" });

    expect(result).toEqual({ nameEn: "Updated name" });
  });

  it("still validates tags when they are supplied", () => {
    expect(categoryUpdateSchema.safeParse({ tags: [""] }).success).toBe(false);
    expect(categoryUpdateSchema.safeParse({ tags: ["oil"] }).success).toBe(true);
  });

  it("keeps an explicitly emptied tags array", () => {
    expect(categoryUpdateSchema.parse({ tags: [] })).toEqual({ tags: [] });
  });

  // Same trap as tags: a surviving default would send every renamed category
  // back to the front of the storefront list.
  it("leaves sortOrder alone when it is not part of the update", () => {
    expect(categoryUpdateSchema.parse({ nameEn: "Updated name" })).not.toHaveProperty("sortOrder");
    expect(categoryUpdateSchema.parse({ sortOrder: 3 })).toEqual({ sortOrder: 3 });
  });

  it("unpins a category when sortOrder is explicitly cleared", () => {
    expect(categoryUpdateSchema.parse({ sortOrder: null })).toEqual({ sortOrder: null });
  });

  // Same shape as sortOrder above: null clears, an absent key leaves it alone.
  it("clears the image when it is explicitly nulled", () => {
    expect(categoryUpdateSchema.parse({ image: null })).toEqual({ image: null });
    expect(categoryUpdateSchema.parse({ nameEn: "Updated name" })).not.toHaveProperty("image");
  });

  it("still rejects an empty-string image", () => {
    expect(categoryUpdateSchema.safeParse({ image: "" }).success).toBe(false);
  });
});
