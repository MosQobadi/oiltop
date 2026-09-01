import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { fitmentClimateSchema, partTypeSchema } from "./enums";
import { apiGradeSchema, viscositySchema, volumeMlSchema } from "./product";

// API service categories that may be recommended.
//
// The list stops at SP on purpose. SQ appears all over the imported spec notes
// and **is not a published API category** — the sequence ends at SP — so
// storing it would put a standard that does not exist on a customer's screen.
// SJ, SL and SM are real but superseded (SJ dates from 1996); an oil meeting
// only those should not be recommended for a car on the road today. Both are
// rejected here rather than filtered silently, so an admin who types one is
// told why.
export const API_SERVICE_CATEGORIES = ["SN", "SN PLUS", "SP"] as const;

// Litres, as a millilitre count. The floor and ceiling are sanity rails, not
// engineering limits: the 647 imported figures span 2.7 to 9.2 litres, and a
// motorcycle sump is still comfortably above 500 ml.
export const OIL_CAPACITY_MIN_ML = 500;
export const OIL_CAPACITY_MAX_ML = 20_000;

const oilCapacityMlSchema = z
  .number()
  .int("Oil capacity must be a whole number of millilitres")
  .min(OIL_CAPACITY_MIN_ML, "That is too little oil for an engine — check the decimal point")
  .max(OIL_CAPACITY_MAX_ML, "That is too much oil for an engine — check the decimal point");

const API_GRADE_ERROR = `Use one of: ${API_SERVICE_CATEGORIES.join(", ")}. SQ is not a published API category, and SJ/SL/SM are obsolete.`;

// Written the way the bottle prints it — "SN PLUS", not "SNPLUS" — after the
// spacing is normalised, since the source runs them together.
const oilApiGradeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase().replace(/\s+/g, " "))
  .refine(
    (value) => (API_SERVICE_CATEGORIES as readonly string[]).includes(value),
    API_GRADE_ERROR,
  );

const fitmentProfileShape = {
  label: z.string().min(1, "Label is required").max(200),
  internalNote: z.string().max(2000).nullable().optional(),

  // Engine-oil guidance. Nullable rather than merely optional so a PATCH can
  // clear a grade the shop decided it should not have stated.
  oilViscosityStandard: viscositySchema.nullable().optional(),
  oilViscosityHot: viscositySchema.nullable().optional(),
  oilViscosityCold: viscositySchema.nullable().optional(),
  // Deduplicated, because the source lists the same grade twice often enough
  // that it would otherwise reach the card as "SP · SP".
  oilApiGrades: z
    .array(oilApiGradeSchema)
    .max(6)
    .transform((grades) => [...new Set(grades)])
    .optional(),
  // Bounded rather than merely positive: the imported figures run 2.7 to 9.2
  // litres, and a car needing less than half a litre or more than twenty is a
  // slipped decimal point, not a car. The form takes litres and converts.
  oilCapacityNoFilterMl: oilCapacityMlSchema.nullable().optional(),
  oilCapacityWithFilterMl: oilCapacityMlSchema.nullable().optional(),
  oilGuideEn: z.string().max(2000).nullable().optional(),
  oilGuideFa: z.string().max(2000).nullable().optional(),
};

// A new filter has to be filled too, so the with-filter figure is the larger of
// the two. Equal is wrong for the same reason. The imported data had exactly
// one pair the wrong way round — Samand XU7, 4.5 without and 4.1 with — which
// is the kind of thing that reads as authoritative on a car card and sends
// somebody home half a litre short.
function checkOilCapacityOrder(
  data: { oilCapacityNoFilterMl?: number | null; oilCapacityWithFilterMl?: number | null },
  ctx: z.RefinementCtx,
) {
  const { oilCapacityNoFilterMl: without, oilCapacityWithFilterMl: with_ } = data;
  if (typeof without === "number" && typeof with_ === "number" && with_ <= without) {
    ctx.addIssue({
      code: "custom",
      path: ["oilCapacityWithFilterMl"],
      message:
        "Must be more than the figure without a filter change — the new filter has to be filled too.",
    });
  }
}

// The one contradiction the imported notes make constantly: the same grade
// listed for "all seasons" and for "very cold". A grade cannot be both the
// year-round answer and the answer for when the year-round one stops working —
// one of the two slots was left unfilled and the template repeated the other.
// Caught here so it cannot be saved, rather than shown to a customer as two
// recommendations that happen to be identical.
function checkViscosityDistinct(
  data: { oilViscosityStandard?: string | null; oilViscosityCold?: string | null; oilViscosityHot?: string | null },
  ctx: z.RefinementCtx,
) {
  for (const key of ["oilViscosityCold", "oilViscosityHot"] as const) {
    const value = data[key];
    if (value && data.oilViscosityStandard && value === data.oilViscosityStandard) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message:
          "Same grade as the all-season one. Leave it empty unless this car really takes a different oil in that weather.",
      });
    }
  }
}

export const fitmentProfileCreateSchema = z
  .object(fitmentProfileShape)
  .superRefine((data, ctx) => {
    checkViscosityDistinct(data, ctx);
    checkOilCapacityOrder(data, ctx);
  });

// The update route supplies the profile's *current* viscosity values when the
// body omits them, so a PATCH that sets only the cold grade is still checked
// against the all-season grade already stored.
export const fitmentProfileUpdateSchema = z
  .object(fitmentProfileShape)
  .partial()
  .superRefine((data, ctx) => {
    checkViscosityDistinct(data, ctx);
    checkOilCapacityOrder(data, ctx);
  });

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
