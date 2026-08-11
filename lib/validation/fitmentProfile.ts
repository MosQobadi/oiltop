import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { fitmentClimateSchema, partTypeSchema } from "./enums";
import { apiGradeSchema, viscositySchema, volumeMlSchema } from "./product";

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

// Kept default-free because `.partial()` does not unwrap a ZodDefault: left as
// `.default(...)` in the shared shape, a PATCH that omitted these would still
// parse to the default and silently reset the column — editing an item's
// adminNote would knock a HOT oil recommendation back to STANDARD and reorder
// it to priority 0. Create opts into the defaults, update doesn't.
//
// The update route supplies the item's *current* climate when the body omits
// it (see app/api/admin/fitment-profiles/[id]/items/[itemId]/route.ts), so
// checkClimate below still runs against the state the item will actually be
// in after the patch.
const climateField = fitmentClimateSchema;
const priorityField = z.number().int();

// `matchSpec` is a query against Product's three structured spec columns, not
// text for a customer (see the column comment in schema.prisma), so it is
// validated with the very same field schemas the product form writes those
// columns through — uppercase transform included. A spec typed "5w30" has to
// come out in the form the catalog stores, or it matches nothing.
const MATCH_SPEC_KEY_ERROR = "Set at least one of viscosity, apiGrade or volumeMl";

function hasSpecKey(spec: {
  viscosity?: unknown;
  apiGrade?: unknown;
  volumeMl?: unknown;
}): boolean {
  return spec.viscosity !== undefined || spec.apiGrade !== undefined || spec.volumeMl !== undefined;
}

// An all-empty spec is rejected rather than stored: matching on nothing would
// resolve to the whole category, which is the one answer a recommendation
// must never give.
export const matchSpecSchema = z
  .object({
    viscosity: viscositySchema,
    apiGrade: apiGradeSchema,
    volumeMl: volumeMlSchema,
  })
  .partial()
  .refine(hasSpecKey, MATCH_SPEC_KEY_ERROR);

export type FitmentMatchSpecInput = z.infer<typeof matchSpecSchema>;

const fitmentProfileItemShape = {
  categoryId: z.string().min(1, "categoryId is required"),
  // Looked up by the caller from the related Category — not a persisted field.
  // Passed alongside the payload solely so the climate/partType rule below can
  // run inside Zod instead of requiring a DB round-trip in the schema layer.
  categoryPartType: partTypeSchema,
  climate: climateField.default("STANDARD"),
  // Nullable so a PATCH can explicitly clear the field (e.g. switching from a
  // matched product back to a spec-only recommendation); omitting the key on
  // PATCH leaves it untouched.
  productId: z.string().min(1).nullable().optional(),
  specNote: z.string().min(1).max(2000).nullable().optional(),
  specAttributes: z.record(z.string(), z.unknown()).nullable().optional(),
  // Nullable for the same reason as productId: sending null is how the admin
  // takes a spec back off an item, omitting the key leaves it alone.
  matchSpec: matchSpecSchema.nullable().optional(),
  priority: priorityField.default(0),
  adminNote: z.string().max(2000).nullable().optional(),
};

function checkClimate(data: { categoryPartType?: string; climate?: string }, ctx: z.RefinementCtx) {
  if (
    data.categoryPartType !== undefined &&
    data.categoryPartType !== "ENGINE_OIL" &&
    data.climate !== undefined &&
    data.climate !== "STANDARD"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["climate"],
      message: "climate must be STANDARD unless the category's partType is ENGINE_OIL",
    });
  }
}

// Same shape as the climate rule above, and for the same reason: viscosity and
// API grade describe an oil, so a spec-matched item on a filter or an accessory
// category would query columns that category's products never fill in. Kept in
// Zod rather than as a database constraint so it can be relaxed without a
// migration if a non-oil category ever gains structured specs.
//
// The update route supplies the item's *current* matchSpec when the body omits
// it (see app/api/admin/fitment-profiles/[id]/items/[itemId]/route.ts), so a
// PATCH that only moves the item to a filter category is still caught.
function checkMatchSpec(
  data: { categoryPartType?: string; matchSpec?: unknown },
  ctx: z.RefinementCtx,
) {
  if (
    data.categoryPartType !== undefined &&
    data.categoryPartType !== "ENGINE_OIL" &&
    data.matchSpec
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["matchSpec"],
      message: "matchSpec is only allowed when the category's partType is ENGINE_OIL",
    });
  }
}

// Only enforced on create: an update is a partial patch, so omitting all three
// fields there just means "leave the existing target alone", not "no target".
function checkTargetPresent(
  data: { productId?: string | null; specNote?: string | null; matchSpec?: unknown },
  ctx: z.RefinementCtx,
) {
  if (!data.productId && !data.specNote && !data.matchSpec) {
    ctx.addIssue({
      code: "custom",
      path: ["productId"],
      message: "At least one of productId, matchSpec or specNote is required",
    });
  }
}

export const fitmentProfileItemCreateSchema = z
  .object(fitmentProfileItemShape)
  .superRefine((data, ctx) => {
    checkClimate(data, ctx);
    checkMatchSpec(data, ctx);
    checkTargetPresent(data, ctx);
  });

export const fitmentProfileItemUpdateSchema = z
  .object({
    ...fitmentProfileItemShape,
    climate: climateField,
    priority: priorityField,
  })
  .partial()
  .superRefine((data, ctx) => {
    checkClimate(data, ctx);
    checkMatchSpec(data, ctx);
  });

export type FitmentProfileItemCreateInput = z.infer<typeof fitmentProfileItemCreateSchema>;
export type FitmentProfileItemUpdateInput = z.infer<typeof fitmentProfileItemUpdateSchema>;

// The live "what does this spec match?" readout behind the item modal. Takes
// the spec as query params rather than an item id because the admin is asking
// *before* the item exists — the whole point is to see that "5W-30 / SN" means
// something in this catalog before saving it as a recommendation.
export const fitmentSpecMatchQuerySchema = z
  .object({
    categoryId: z.string().min(1, "categoryId is required"),
    viscosity: viscositySchema.optional(),
    apiGrade: apiGradeSchema.optional(),
    // Query params arrive as strings; the column, and the stored spec, is a number.
    volumeMl: z.coerce.number().pipe(volumeMlSchema).optional(),
  })
  .refine(hasSpecKey, MATCH_SPEC_KEY_ERROR);

export type FitmentSpecMatchQuery = z.infer<typeof fitmentSpecMatchQuerySchema>;

export const fitmentProfileAttachSchema = z.object({
  carEngineIds: z.array(z.string().min(1)).min(1, "Select at least one engine"),
});

export type FitmentProfileAttachInput = z.infer<typeof fitmentProfileAttachSchema>;
