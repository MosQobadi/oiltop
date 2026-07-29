import { z } from "zod";
import { slugSchema } from "./common";
import {
  categoryStatusSchema,
  filterKindSchema,
  partTypeSchema,
} from "./enums";

const categoryShape = {
  slug: slugSchema,
  nameEn: z.string().min(1).max(200),
  nameFa: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(50)).default([]),
  shortDescriptionEn: z.string().min(1).max(500),
  shortDescriptionFa: z.string().min(1).max(500),
  longDescriptionEn: z.string().min(1).max(5000),
  longDescriptionFa: z.string().min(1).max(5000),
  metaTitleEn: z.string().max(70).optional(),
  metaTitleFa: z.string().max(70).optional(),
  metaDescriptionEn: z.string().max(160).optional(),
  metaDescriptionFa: z.string().max(160).optional(),
  image: z.string().min(1).optional(),
  status: categoryStatusSchema,
  partType: partTypeSchema,
  filterKind: filterKindSchema.optional(),
};

// filterKind is only meaningful (and only allowed) when partType is FILTER —
// see Category.filterKind in CLAUDE.md.
function checkFilterKind(
  data: { partType?: string; filterKind?: string },
  ctx: z.RefinementCtx,
) {
  if (data.partType === undefined) return;
  if (data.partType === "FILTER" && !data.filterKind) {
    ctx.addIssue({
      code: "custom",
      path: ["filterKind"],
      message: "filterKind is required when partType is FILTER",
    });
  }
  if (data.partType !== "FILTER" && data.filterKind) {
    ctx.addIssue({
      code: "custom",
      path: ["filterKind"],
      message: "filterKind must only be set when partType is FILTER",
    });
  }
}

export const categoryCreateSchema = z
  .object(categoryShape)
  .superRefine(checkFilterKind);
export const categoryUpdateSchema = z
  .object(categoryShape)
  .partial()
  .superRefine(checkFilterKind);

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
