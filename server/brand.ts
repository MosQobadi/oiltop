import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import type { BrandCreateInput, BrandListQuery, BrandUpdateInput } from "@/lib/validation";

export class BrandNotFoundError extends Error {}
export class DuplicateSlugError extends Error {}
export class BrandHasProductsError extends Error {}

function withProductCount<T extends { _count: { products: number } }>(brand: T) {
  const { _count, ...rest } = brand;
  return { ...rest, productCount: _count.products };
}

export async function listBrands(query: BrandListQuery) {
  const where: Prisma.BrandWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    // Tokenised — see `lib/search.ts`.
    AND: searchTokens(query.search).map((token) => ({
      OR: [{ nameEn: contains(token) }, { nameFa: contains(token) }],
    })),
  };

  const [brands, total] = await Promise.all([
    prisma.brand.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.brand.count({ where }),
  ]);

  return { brands: brands.map(withProductCount), total };
}

export async function listBrandOptions() {
  return prisma.brand.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, nameEn: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function getBrandById(id: string) {
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!brand) {
    throw new BrandNotFoundError(`Brand "${id}" was not found`);
  }
  return withProductCount(brand);
}

export async function createBrand(input: BrandCreateInput) {
  const slug = input.slug ?? slugify(input.nameEn);

  const existing = await prisma.brand.findUnique({ where: { slug } });
  if (existing) {
    throw new DuplicateSlugError(`A brand with slug "${slug}" already exists`);
  }

  return prisma.brand.create({
    data: { ...input, slug },
  });
}

export async function updateBrand(id: string, input: BrandUpdateInput) {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) {
    throw new BrandNotFoundError(`Brand "${id}" was not found`);
  }

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.brand.findUnique({
      where: { slug: input.slug },
    });
    if (conflict) {
      throw new DuplicateSlugError(`A brand with slug "${input.slug}" already exists`);
    }
    slug = input.slug;
  }

  return prisma.brand.update({
    where: { id },
    data: { ...input, slug },
  });
}

export async function deleteBrand(id: string) {
  const existing = await prisma.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) {
    throw new BrandNotFoundError(`Brand "${id}" was not found`);
  }
  if (existing._count.products > 0) {
    throw new BrandHasProductsError(
      `Cannot delete brand with ${existing._count.products} product(s) attached — reassign or remove them first`,
    );
  }

  await prisma.brand.delete({ where: { id } });
}
