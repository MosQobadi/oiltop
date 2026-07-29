import { z } from "zod";
import { carEngineStatusSchema, fuelTypeSchema } from "./enums";

const carEngineShape = {
  carModelId: z.string().min(1, "carModelId is required"),
  labelEn: z.string().min(1).max(100),
  labelFa: z.string().min(1).max(100),
  yearStart: z.number().int().min(1900).max(2100),
  yearEnd: z.number().int().min(1900).max(2100).optional(),
  fuelType: fuelTypeSchema,
  displacementCc: z.number().int().positive().optional(),
  engineCode: z.string().min(1).max(50).optional(),
  status: carEngineStatusSchema,
};

function checkYearRange(
  data: { yearStart?: number; yearEnd?: number },
  ctx: z.RefinementCtx,
) {
  if (
    data.yearStart !== undefined &&
    data.yearEnd !== undefined &&
    data.yearStart > data.yearEnd
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["yearEnd"],
      message: "yearEnd must be greater than or equal to yearStart",
    });
  }
}

export const carEngineCreateSchema = z
  .object(carEngineShape)
  .superRefine(checkYearRange);
export const carEngineUpdateSchema = z
  .object(carEngineShape)
  .partial()
  .superRefine(checkYearRange);

export type CarEngineCreateInput = z.infer<typeof carEngineCreateSchema>;
export type CarEngineUpdateInput = z.infer<typeof carEngineUpdateSchema>;
