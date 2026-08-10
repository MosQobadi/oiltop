import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import type {
  CarEngineCreateInput,
  CarEngineListQuery,
  CarEngineSearchableQuery,
  CarEngineUpdateInput,
} from "@/lib/validation";

export class CarEngineNotFoundError extends Error {}
export class CarEngineHasFitmentProfileLinksError extends Error {}

export async function listCarEngines(query: CarEngineListQuery) {
  const where: Prisma.CarEngineWhereInput = {
    carModelId: query.carModelId,
    ...(query.status ? { status: query.status } : {}),
    // Tokenised — see `lib/search.ts`.
    AND: searchTokens(query.search).map((token) => ({
      OR: [{ labelEn: contains(token) }, { labelFa: contains(token) }],
    })),
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
  const carEngine = await prisma.carEngine.findUnique({
    where: { id },
    include: {
      fitmentProfileLinks: {
        include: {
          profile: { include: { _count: { select: { items: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!carEngine) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }

  const { fitmentProfileLinks, ...rest } = carEngine;
  return {
    ...rest,
    fitmentProfileLinks: fitmentProfileLinks.map((link) => ({
      id: link.id,
      profile: {
        id: link.profile.id,
        label: link.profile.label,
        itemCount: link.profile._count.items,
      },
    })),
  };
}

export async function createCarEngine(input: CarEngineCreateInput) {
  return prisma.carEngine.create({ data: input });
}

export async function updateCarEngine(id: string, input: CarEngineUpdateInput) {
  const existing = await prisma.carEngine.findUnique({ where: { id } });
  if (!existing) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }

  return prisma.carEngine.update({ where: { id }, data: input });
}

export async function deleteCarEngine(id: string) {
  const existing = await prisma.carEngine.findUnique({
    where: { id },
    include: { _count: { select: { fitmentProfileLinks: true } } },
  });
  if (!existing) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }
  if (existing._count.fitmentProfileLinks > 0) {
    throw new CarEngineHasFitmentProfileLinksError(
      `Cannot delete car engine with ${existing._count.fitmentProfileLinks} fitment profile(s) attached — detach them first`,
    );
  }

  await prisma.carEngine.delete({ where: { id } });
}

// Backs the Fitment Profile "Attach Engines" picker: {id, label} pairs
// (label = "Brand Model Engine (yearStart–yearEnd)") filterable by brand,
// model, and year range so an admin can narrow before bulk-attaching.
export async function listSearchableCarEngines(query: CarEngineSearchableQuery) {
  const where: Prisma.CarEngineWhereInput = {
    status: "ACTIVE",
    carModelId: query.carModelId,
    carModel: query.carBrandId ? { carBrandId: query.carBrandId } : undefined,
    AND: [
      ...(query.yearFrom !== undefined
        ? [{ OR: [{ yearEnd: null }, { yearEnd: { gte: query.yearFrom } }] }]
        : []),
      ...(query.yearTo !== undefined ? [{ yearStart: { lte: query.yearTo } }] : []),
      // Tokenised so "Peugeot 206" spans carBrand.nameEn + carModel.nameEn —
      // the picker's label is built from both, so neither column ever contains
      // the whole phrase. See `lib/search.ts`.
      ...searchTokens(query.search).map((token) => ({
        OR: [
          { labelEn: contains(token) },
          { labelFa: contains(token) },
          { carModel: { nameEn: contains(token) } },
          { carModel: { carBrand: { nameEn: contains(token) } } },
        ],
      })),
    ],
  };

  const [carEngines, total] = await Promise.all([
    prisma.carEngine.findMany({
      where,
      include: { carModel: { include: { carBrand: true } } },
      orderBy: [
        { carModel: { carBrand: { nameEn: "asc" } } },
        { carModel: { nameEn: "asc" } },
        { labelEn: "asc" },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.carEngine.count({ where }),
  ]);

  return {
    carEngines: carEngines.map((engine) => ({
      id: engine.id,
      label: `${engine.carModel.carBrand.nameEn} ${engine.carModel.nameEn} ${engine.labelEn} (${engine.yearStart}–${engine.yearEnd ?? "Present"})`,
    })),
    total,
  };
}
