import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { fitmentClimateSchema, partTypeSchema } from "./enums";

const fitmentProfileShape = {
  label: z.string().min(1, "Label is required").max(200),
  internalNote: z.string().max(2000).nullable().optional(),
};

export const fitmentProfileCreateSchema = z.object(fitmentProfileShape);
export const fitmentProfileUpdateSchema = z.object(fitmentProfileShape).partial();

export type FitmentProfileCreateInput = z.infer<typeof fitmentProfileCreateSchema>;
export type FitmentProfileUpdateInput = z.infer<typeof fitmentProfileUpdateSchema>;

export const fitmentProfileListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type FitmentProfileListQuery = z.infer<typeof fitmentProfileListQuerySchema>;

const fitmentProfileItemShape = {
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

export const fitmentProfileItemCreateSchema = z
  .object(fitmentProfileItemShape)
  .superRefine((data, ctx) => {
    checkClimate(data, ctx);
    checkTargetPresent(data, ctx);
  });

export const fitmentProfileItemUpdateSchema = z
  .object(fitmentProfileItemShape)
  .partial()
  .superRefine(checkClimate);

export type FitmentProfileItemCreateInput = z.infer<
  typeof fitmentProfileItemCreateSchema
>;
export type FitmentProfileItemUpdateInput = z.infer<
  typeof fitmentProfileItemUpdateSchema
>;

export const fitmentProfileAttachSchema = z.object({
  carEngineIds: z.array(z.string().min(1)).min(1, "Select at least one engine"),
});

export type FitmentProfileAttachInput = z.infer<typeof fitmentProfileAttachSchema>;
