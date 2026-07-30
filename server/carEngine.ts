import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  CarEngineCreateInput,
  CarEngineListQuery,
  CarEngineUpdateInput,
} from "@/lib/validation";

export class CarEngineNotFoundError extends Error {}
export class CarEngineHasFitmentRecommendationsError extends Error {}

export async function listCarEngines(query: CarEngineListQuery) {
  const where: Prisma.CarEngineWhereInput = {
    carModelId: query.carModelId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { labelEn: { contains: query.search, mode: "insensitive" } },
            { labelFa: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [carEngines, total] = await Promise.all([
    prisma.carEngine.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.carEngine.count({ where }),
  ]);

  return { carEngines, total };
}

export async function getCarEngineById(id: string) {
  const carEngine = await prisma.carEngine.findUnique({ where: { id } });
  if (!carEngine) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }
  return carEngine;
}

export async function createCarEngine(input: CarEngineCreateInput) {
  return prisma.carEngine.create({ data: input });
}

export async function updateCarEngine(
  id: string,
  input: CarEngineUpdateInput,
) {
  const existing = await prisma.carEngine.findUnique({ where: { id } });
  if (!existing) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }

  return prisma.carEngine.update({ where: { id }, data: input });
}

export async function deleteCarEngine(id: string) {
  const existing = await prisma.carEngine.findUnique({
    where: { id },
    include: { _count: { select: { fitmentRecommendations: true } } },
  });
  if (!existing) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }
  if (existing._count.fitmentRecommendations > 0) {
    throw new CarEngineHasFitmentRecommendationsError(
      `Cannot delete car engine with ${existing._count.fitmentRecommendations} fitment recommendation(s) attached — reassign or remove them first`,
    );
  }

  await prisma.carEngine.delete({ where: { id } });
}
