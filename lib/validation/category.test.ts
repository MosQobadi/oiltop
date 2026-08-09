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

  it("requires filterKind when partType is FILTER", () => {
    const result = categoryCreateSchema.safeParse({
      ...validCategory,
      partType: "FILTER",
    });
    expect(result.success).toBe(false);
  });

  it("accepts filterKind when partType is FILTER", () => {
    const result = categoryCreateSchema.safeParse({
      ...validCategory,
      partType: "FILTER",
      filterKind: "OIL_FILTER",
    });
    expect(result.success).toBe(true);
  });

  it("rejects filterKind set when partType is not FILTER", () => {
    const result = categoryCreateSchema.safeParse({
      ...validCategory,
      partType: "ENGINE_OIL",
      filterKind: "OIL_FILTER",
    });
    expect(result.success).toBe(false);
  });
});

describe("categoryCreateSchema defaults", () => {
  it("fills in tags when they are omitted", () => {
    const withoutTags: Partial<typeof validCategory> = { ...validCategory };
    delete withoutTags.tags;

    expect(categoryCreateSchema.parse(withoutTags).tags).toEqual([]);
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
});
