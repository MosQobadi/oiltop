import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { CarBrandCreateInput, CarBrandListQuery, CarBrandUpdateInput } from "@/lib/validation";

export class CarBrandNotFoundError extends Error {}
export class DuplicateSlugError extends Error {}
export class CarBrandHasModelsError extends Error {}

function withModelCount<T extends { _count: { models: number } }>(carBrand: T) {
  const { _count, ...rest } = carBrand;
  return { ...rest, modelCount: _count.models };
}

export async function listCarBrands(query: CarBrandListQuery) {
  const where: Prisma.CarBrandWhereInput = {
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

  const [carBrands, total] = await Promise.all([
    prisma.carBrand.findMany({
      where,
      include: { _count: { select: { models: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.carBrand.count({ where }),
  ]);

  return { carBrands: carBrands.map(withModelCount), total };
}

export async function listCarBrandOptions() {
  return prisma.carBrand.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, nameEn: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function getCarBrandById(id: string) {
  const carBrand = await prisma.carBrand.findUnique({
    where: { id },
    include: { _count: { select: { models: true } } },
  });
  if (!carBrand) {
    throw new CarBrandNotFoundError(`Car brand "${id}" was not found`);
  }
  return withModelCount(carBrand);
}

export async function createCarBrand(input: CarBrandCreateInput) {
  const slug = input.slug ?? slugify(input.nameEn);

  const existing = await prisma.carBrand.findUnique({ where: { slug } });
  if (existing) {
    throw new DuplicateSlugError(`A car brand with slug "${slug}" already exists`);
  }

  return prisma.carBrand.create({
    data: { ...input, slug },
  });
}

export async function updateCarBrand(id: string, input: CarBrandUpdateInput) {
  const existing = await prisma.carBrand.findUnique({ where: { id } });
  if (!existing) {
    throw new CarBrandNotFoundError(`Car brand "${id}" was not found`);
  }

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.carBrand.findUnique({
      where: { slug: input.slug },
    });
    if (conflict) {
      throw new DuplicateSlugError(`A car brand with slug "${input.slug}" already exists`);
    }
    slug = input.slug;
  }

  return prisma.carBrand.update({
    where: { id },
    data: { ...input, slug },
  });
}

export async function deleteCarBrand(id: string) {
  const existing = await prisma.carBrand.findUnique({
    where: { id },
    include: { _count: { select: { models: true } } },
  });
  if (!existing) {
    throw new CarBrandNotFoundError(`Car brand "${id}" was not found`);
  }
  if (existing._count.models > 0) {
    throw new CarBrandHasModelsError(
      `Cannot delete car brand with ${existing._count.models} car model(s) attached — reassign or remove them first`,
    );
  }

  await prisma.carBrand.delete({ where: { id } });
}
