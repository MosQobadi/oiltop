import { describe, expect, it } from "vitest";
import {
  fitmentProfileItemCreateSchema,
  fitmentProfileItemUpdateSchema,
  fitmentSpecMatchQuerySchema,
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

  it("requires a productId, a matchSpec or a specNote", () => {
    expect(
      fitmentProfileItemCreateSchema.safeParse({
        categoryId: "cat_1",
        categoryPartType: "ENGINE_OIL",
      }).success,
    ).toBe(false);
  });

  it("accepts a matchSpec as the item's only target", () => {
    const result = fitmentProfileItemCreateSchema.safeParse({
      categoryId: "cat_1",
      categoryPartType: "ENGINE_OIL",
      matchSpec: { viscosity: "5W-30", apiGrade: "SN" },
    });

    expect(result.success).toBe(true);
  });

  // The catalog stores these codes uppercase, so a spec typed in lower case has
  // to be normalised on the way in or it queries for a value no row holds.
  it("uppercases a matchSpec's codes", () => {
    const result = fitmentProfileItemCreateSchema.parse({
      categoryId: "cat_1",
      categoryPartType: "ENGINE_OIL",
      matchSpec: { viscosity: "5w30", apiGrade: "sn" },
    });

    expect(result.matchSpec).toEqual({ viscosity: "5W30", apiGrade: "SN" });
  });

  it("rejects a matchSpec on a non-oil category", () => {
    const result = fitmentProfileItemCreateSchema.safeParse({
      categoryId: "cat_1",
      categoryPartType: "FILTER",
      matchSpec: { viscosity: "5W-30" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a matchSpec that constrains nothing", () => {
    expect(
      fitmentProfileItemCreateSchema.safeParse({
        categoryId: "cat_1",
        categoryPartType: "ENGINE_OIL",
        matchSpec: {},
      }).success,
    ).toBe(false);
  });

  it("rejects a matchSpec whose viscosity is prose", () => {
    expect(
      fitmentProfileItemCreateSchema.safeParse({
        categoryId: "cat_1",
        categoryPartType: "ENGINE_OIL",
        matchSpec: { viscosity: "thin-ish" },
      }).success,
    ).toBe(false);
  });
});

describe("fitmentProfileItemUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(fitmentProfileItemUpdateSchema.safeParse({ adminNote: "Checked" }).success).toBe(true);
  });

  // A default that survives `.partial()` turns "add a note to this item" into
  // "add a note, knock the climate back to STANDARD, and reorder it to 0".
  it("leaves omitted defaulted fields out of the parsed update", () => {
    const result = fitmentProfileItemUpdateSchema.parse({ adminNote: "Checked" });

    expect(result).toEqual({ adminNote: "Checked" });
  });

  it("still validates climate and priority when they are supplied", () => {
    expect(fitmentProfileItemUpdateSchema.safeParse({ climate: "TROPICAL" }).success).toBe(false);
    expect(fitmentProfileItemUpdateSchema.safeParse({ priority: 1.5 }).success).toBe(false);
    expect(fitmentProfileItemUpdateSchema.safeParse({ climate: "HOT", priority: 2 }).success).toBe(
      true,
    );
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

  // The route re-supplies the item's stored matchSpec when the body omits it,
  // so this is what catches "move an oil item to a filter category" — a patch
  // that never mentions the spec it would strand.
  it("still applies the matchSpec/partType rule to a supplied matchSpec", () => {
    expect(
      fitmentProfileItemUpdateSchema.safeParse({
        categoryPartType: "FILTER",
        matchSpec: { viscosity: "5W-30" },
      }).success,
    ).toBe(false);
  });

  it("accepts null as a way to clear a matchSpec", () => {
    expect(fitmentProfileItemUpdateSchema.parse({ matchSpec: null })).toEqual({
      matchSpec: null,
    });
  });
});

describe("fitmentSpecMatchQuerySchema", () => {
  it("coerces volumeMl out of a query string", () => {
    const result = fitmentSpecMatchQuerySchema.parse({
      categoryId: "cat_1",
      volumeMl: "4000",
    });

    expect(result.volumeMl).toBe(4000);
  });

  it("normalises codes the same way the stored spec does", () => {
    const result = fitmentSpecMatchQuerySchema.parse({
      categoryId: "cat_1",
      viscosity: "5w-30",
      apiGrade: "sn",
    });

    expect(result).toMatchObject({ viscosity: "5W-30", apiGrade: "SN" });
  });

  // Matching on nothing would count the whole category, which is never the
  // answer the admin is asking for.
  it("rejects a query with no spec keys", () => {
    expect(fitmentSpecMatchQuerySchema.safeParse({ categoryId: "cat_1" }).success).toBe(false);
  });

  it("requires a categoryId", () => {
    expect(fitmentSpecMatchQuerySchema.safeParse({ viscosity: "5W-30" }).success).toBe(false);
  });
});
