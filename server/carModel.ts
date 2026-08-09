import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { CarModelCreateInput, CarModelListQuery, CarModelUpdateInput } from "@/lib/validation";

export class CarModelNotFoundError extends Error {}
export class DuplicateSlugError extends Error {}
export class CarModelHasEnginesError extends Error {}

function withEngineCount<T extends { _count: { engines: number } }>(carModel: T) {
  const { _count, ...rest } = carModel;
  return { ...rest, engineCount: _count.engines };
}

export async function listCarModels(query: CarModelListQuery) {
  const where: Prisma.CarModelWhereInput = {
    carBrandId: query.carBrandId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: query.search, mode: "insensitive" } },
            { nameFa: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [carModels, total] = await Promise.all([
    prisma.carModel.findMany({
      where,
      include: { _count: { select: { engines: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.carModel.count({ where }),
  ]);

  return { carModels: carModels.map(withEngineCount), total };
}

export async function getCarModelById(id: string) {
  const carModel = await prisma.carModel.findUnique({
    where: { id },
    include: { _count: { select: { engines: true } } },
  });
  if (!carModel) {
    throw new CarModelNotFoundError(`Car model "${id}" was not found`);
  }
  return withEngineCount(carModel);
}

export async function createCarModel(input: CarModelCreateInput) {
  const slug = input.slug ?? slugify(input.nameEn);

  const existing = await prisma.carModel.findUnique({
    where: { carBrandId_slug: { carBrandId: input.carBrandId, slug } },
  });
  if (existing) {
    throw new DuplicateSlugError(
      `A car model with slug "${slug}" already exists for this car brand`,
    );
  }

  return prisma.carModel.create({
    data: { ...input, slug },
  });
}

export async function updateCarModel(id: string, input: CarModelUpdateInput) {
  const existing = await prisma.carModel.findUnique({ where: { id } });
  if (!existing) {
    throw new CarModelNotFoundError(`Car model "${id}" was not found`);
  }

  const carBrandId = input.carBrandId ?? existing.carBrandId;

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.carModel.findUnique({
      where: { carBrandId_slug: { carBrandId, slug: input.slug } },
    });
    if (conflict) {
      throw new DuplicateSlugError(
        `A car model with slug "${input.slug}" already exists for this car brand`,
      );
    }
    slug = input.slug;
  }

  return prisma.carModel.update({
    where: { id },
    data: { ...input, slug },
  });
}

export async function deleteCarModel(id: string) {
  const existing = await prisma.carModel.findUnique({
    where: { id },
    include: { _count: { select: { engines: true } } },
  });
  if (!existing) {
    throw new CarModelNotFoundError(`Car model "${id}" was not found`);
  }
  if (existing._count.engines > 0) {
    throw new CarModelHasEnginesError(
      `Cannot delete car model with ${existing._count.engines} car engine(s) attached — reassign or remove them first`,
    );
  }

  await prisma.carModel.delete({ where: { id } });
}
