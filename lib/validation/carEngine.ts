import { z } from "zod";
import { ANY_CALENDAR_YEAR_MAX, ANY_CALENDAR_YEAR_MIN } from "@/lib/year";
import { pageSchema, pageSizeSchema } from "./common";
import { carEngineStatusSchema, fuelTypeSchema } from "./enums";

// Years are bounded here only by the widest window either calendar can use,
// because this schema validates a request in isolation and the calendar lives
// on the engine's *model*. The calendar-specific range — Jalali 1370 to next
// year, Gregorian 1900-2100 — is enforced in server/carEngine.ts, which reads
// the model from the database rather than trusting anything the client sent.
const carEngineShape = {
  carModelId: z.string().min(1, "carModelId is required"),
  labelEn: z.string().min(1).max(100),
  labelFa: z.string().min(1).max(100),
  yearStart: z.number().int().min(ANY_CALENDAR_YEAR_MIN).max(ANY_CALENDAR_YEAR_MAX),
  // Nullable (not just optional) so a PATCH can explicitly clear it back to
  // "still in production" — omitting the key on PATCH leaves it untouched.
  yearEnd: z
    .number()
    .int()
    .min(ANY_CALENDAR_YEAR_MIN)
    .max(ANY_CALENDAR_YEAR_MAX)
    .nullable()
    .optional(),
  // Nullable for the same reason yearEnd is: a PATCH has to be able to clear the
  // photo back to "fall back to the model's", which `optional` alone can't say.
  image: z.string().min(1).nullable().optional(),
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
//
// This is the one year filter that spans calendars, since it searches across
// models, so it takes the widest window rather than one calendar's. That is
// still correct rather than merely permissive: the two windows are disjoint, so
// a 1390–1399 filter matches no Gregorian car — which is right, because a
// Gregorian car has no year 1390.
export const carEngineSearchableQuerySchema = z
  .object({
    carBrandId: z.string().min(1).optional(),
    carModelId: z.string().min(1).optional(),
    yearFrom: z.coerce
      .number()
      .int()
      .min(ANY_CALENDAR_YEAR_MIN)
      .max(ANY_CALENDAR_YEAR_MAX)
      .optional(),
    yearTo: z.coerce
      .number()
      .int()
      .min(ANY_CALENDAR_YEAR_MIN)
      .max(ANY_CALENDAR_YEAR_MAX)
      .optional(),
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
