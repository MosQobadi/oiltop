import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { fitmentClimateSchema, partTypeSchema } from "./enums";

const fitmentRecommendationShape = {
  carEngineId: z.string().min(1, "carEngineId is required"),
  categoryId: z.string().min(1, "categoryId is required"),
  // Looked up by the caller from the related Category — not a persisted field.
  // Passed alongside the payload solely so the climate/partType rule below can
  // run inside Zod instead of requiring a DB round-trip in the schema layer.
  categoryPartType: partTypeSchema,
  climate: fitmentClimateSchema.default("STANDARD"),
  // Nullable so a PATCH can explicitly clear the field (e.g. switching from a
  // matched product back to a spec-only recommendation); omitting the key on
  // PATCH leaves it untouched.
  productId: z.string().min(1).nullable().optional(),
  specNote: z.string().min(1).max(2000).nullable().optional(),
  specAttributes: z.record(z.string(), z.unknown()).nullable().optional(),
  priority: z.number().int().default(0),
  adminNote: z.string().max(2000).nullable().optional(),
};

function checkClimate(
  data: { categoryPartType?: string; climate?: string },
  ctx: z.RefinementCtx,
) {
  if (
    data.categoryPartType !== undefined &&
    data.categoryPartType !== "ENGINE_OIL" &&
    data.climate !== undefined &&
    data.climate !== "STANDARD"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["climate"],
      message:
        "climate must be STANDARD unless the category's partType is ENGINE_OIL",
    });
  }
}

// Only enforced on create: an update is a partial patch, so omitting both
// fields there just means "leave the existing target alone", not "no target".
function checkTargetPresent(
  data: { productId?: string | null; specNote?: string | null },
  ctx: z.RefinementCtx,
) {
  if (!data.productId && !data.specNote) {
    ctx.addIssue({
      code: "custom",
      path: ["productId"],
      message: "At least one of productId or specNote is required",
    });
  }
}

export const fitmentRecommendationCreateSchema = z
  .object(fitmentRecommendationShape)
  .superRefine((data, ctx) => {
    checkClimate(data, ctx);
    checkTargetPresent(data, ctx);
  });

export const fitmentRecommendationUpdateSchema = z
  .object(fitmentRecommendationShape)
  .partial()
  .superRefine(checkClimate);

export type FitmentRecommendationCreateInput = z.infer<
  typeof fitmentRecommendationCreateSchema
>;
export type FitmentRecommendationUpdateInput = z.infer<
  typeof fitmentRecommendationUpdateSchema
>;

export const fitmentRecommendationListQuerySchema = z.object({
  carEngineId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type FitmentRecommendationListQuery = z.infer<
  typeof fitmentRecommendationListQuerySchema
>;
