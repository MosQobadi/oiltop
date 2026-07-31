import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  FitmentRecommendationCreateInput,
  FitmentRecommendationListQuery,
  FitmentRecommendationUpdateInput,
} from "@/lib/validation";

export class FitmentRecommendationNotFoundError extends Error {}

// Prisma's Json fields distinguish a true SQL NULL column (Prisma.DbNull)
// from the JSON literal null (Prisma.JsonNull) — a plain `null` isn't a valid
// input for either. "Clearing" specAttributes means the former.
function toJsonInput(value: Record<string, unknown> | null | undefined) {
  if (value === null) return Prisma.DbNull;
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

const fitmentRecommendationInclude = {
  carEngine: { select: { id: true, labelEn: true } },
  category: { select: { id: true, nameEn: true, partType: true } },
  product: { select: { id: true, nameEn: true } },
} satisfies Prisma.FitmentRecommendationInclude;

// Looks up the partType of a recommendation's category so the route layer can
// inject it into the payload as `categoryPartType` before Zod validation runs
// the climate/partType cross-field rule — see lib/validation/fitmentRecommendation.ts.
export async function getCategoryPartType(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { partType: true },
  });
  return category?.partType;
}

export async function listFitmentRecommendations(
  query: FitmentRecommendationListQuery,
) {
  const where: Prisma.FitmentRecommendationWhereInput = {
    ...(query.carEngineId ? { carEngineId: query.carEngineId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  };

  const [fitmentRecommendations, total] = await Promise.all([
    prisma.fitmentRecommendation.findMany({
      where,
      include: fitmentRecommendationInclude,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.fitmentRecommendation.count({ where }),
  ]);

  return { fitmentRecommendations, total };
}

export async function getFitmentRecommendationById(id: string) {
  const fitmentRecommendation = await prisma.fitmentRecommendation.findUnique({
    where: { id },
    include: fitmentRecommendationInclude,
  });
  if (!fitmentRecommendation) {
    throw new FitmentRecommendationNotFoundError(
      `Fitment recommendation "${id}" was not found`,
    );
  }
  return fitmentRecommendation;
}

export async function createFitmentRecommendation(
  input: FitmentRecommendationCreateInput,
) {
  return prisma.fitmentRecommendation.create({
    data: {
      carEngineId: input.carEngineId,
      categoryId: input.categoryId,
      climate: input.climate,
      productId: input.productId,
      specNote: input.specNote,
      specAttributes: toJsonInput(input.specAttributes),
      priority: input.priority,
      adminNote: input.adminNote,
    },
    include: fitmentRecommendationInclude,
  });
}

export async function updateFitmentRecommendation(
  id: string,
  input: FitmentRecommendationUpdateInput,
) {
  const existing = await prisma.fitmentRecommendation.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new FitmentRecommendationNotFoundError(
      `Fitment recommendation "${id}" was not found`,
    );
  }

  return prisma.fitmentRecommendation.update({
    where: { id },
    data: {
      carEngineId: input.carEngineId,
      categoryId: input.categoryId,
      climate: input.climate,
      productId: input.productId,
      specNote: input.specNote,
      specAttributes: toJsonInput(input.specAttributes),
      priority: input.priority,
      adminNote: input.adminNote,
    },
    include: fitmentRecommendationInclude,
  });
}

export async function deleteFitmentRecommendation(id: string) {
  const existing = await prisma.fitmentRecommendation.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new FitmentRecommendationNotFoundError(
      `Fitment recommendation "${id}" was not found`,
    );
  }

  await prisma.fitmentRecommendation.delete({ where: { id } });
}
