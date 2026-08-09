import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";
import { carEngineStatusSchema, fuelTypeSchema } from "./enums";

const carEngineShape = {
  carModelId: z.string().min(1, "carModelId is required"),
  labelEn: z.string().min(1).max(100),
  labelFa: z.string().min(1).max(100),
  yearStart: z.number().int().min(1900).max(2100),
  // Nullable (not just optional) so a PATCH can explicitly clear it back to
  // "still in production" — omitting the key on PATCH leaves it untouched.
  yearEnd: z.number().int().min(1900).max(2100).nullable().optional(),
  fuelType: fuelTypeSchema,
  displacementCc: z.number().int().positive().optional(),
  engineCode: z.string().min(1).max(50).optional(),
  status: carEngineStatusSchema,
};

function checkYearRange(
  data: { yearStart?: number; yearEnd?: number | null },
  ctx: z.RefinementCtx,
) {
  if (
    data.yearStart !== undefined &&
    data.yearEnd !== undefined &&
    data.yearEnd !== null &&
    data.yearStart > data.yearEnd
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["yearEnd"],
      message: "yearEnd must be greater than or equal to yearStart",
    });
  }
}

export const carEngineCreateSchema = z.object(carEngineShape).superRefine(checkYearRange);
export const carEngineUpdateSchema = z.object(carEngineShape).partial().superRefine(checkYearRange);

export type CarEngineCreateInput = z.infer<typeof carEngineCreateSchema>;
export type CarEngineUpdateInput = z.infer<typeof carEngineUpdateSchema>;

export const carEngineListQuerySchema = z.object({
  carModelId: z.string().min(1, "carModelId is required"),
  search: z.string().trim().min(1).optional(),
  status: carEngineStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type CarEngineListQuery = z.infer<typeof carEngineListQuerySchema>;

// Backs the Fitment Profile "Attach Engines" picker — all filters optional so
// an admin can narrow by brand/model/year range before picking from the list.
export const carEngineSearchableQuerySchema = z
  .object({
    carBrandId: z.string().min(1).optional(),
    carModelId: z.string().min(1).optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    search: z.string().trim().min(1).optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.yearFrom !== undefined && data.yearTo !== undefined && data.yearFrom > data.yearTo) {
      ctx.addIssue({
        code: "custom",
        path: ["yearTo"],
        message: "yearTo must be greater than or equal to yearFrom",
      });
    }
  });

export type CarEngineSearchableQuery = z.infer<typeof carEngineSearchableQuerySchema>;
