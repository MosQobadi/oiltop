import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { CategoryCreateInput, CategoryListQuery, CategoryUpdateInput } from "@/lib/validation";

export class CategoryNotFoundError extends Error {}
export class DuplicateSlugError extends Error {}
export class CategoryHasProductsError extends Error {}

function withProductCount<T extends { _count: { products: number } }>(category: T) {
  const { _count, ...rest } = category;
  return { ...rest, productCount: _count.products };
}

export async function listCategories(query: CategoryListQuery) {
  const where: Prisma.CategoryWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.partType ? { partType: query.partType } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: query.search, mode: "insensitive" } },
            { nameFa: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.category.count({ where }),
  ]);

  return { categories: categories.map(withProductCount), total };
}

export async function listCategoryOptions() {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, nameEn: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) {
    throw new CategoryNotFoundError(`Category "${id}" was not found`);
  }
  return withProductCount(category);
}

export async function createCategory(input: CategoryCreateInput) {
  const slug = input.slug ?? slugify(input.nameEn);

  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) {
    throw new DuplicateSlugError(`A category with slug "${slug}" already exists`);
  }

  // Belt-and-suspenders: categoryCreateSchema already enforces this, but the
  // DB write shouldn't rely solely on the Zod layer for this invariant —
  // see Category.filterKind in CLAUDE.md.
  const filterKind = input.partType === "FILTER" ? (input.filterKind ?? null) : null;

  return prisma.category.create({
    data: { ...input, slug, filterKind },
  });
}

export async function updateCategory(id: string, input: CategoryUpdateInput) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new CategoryNotFoundError(`Category "${id}" was not found`);
  }

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.category.findUnique({
      where: { slug: input.slug },
    });
    if (conflict) {
      throw new DuplicateSlugError(`A category with slug "${input.slug}" already exists`);
    }
    slug = input.slug;
  }

  const partType = input.partType ?? existing.partType;
  const filterKind = partType === "FILTER" ? (input.filterKind ?? existing.filterKind) : null;

  return prisma.category.update({
    where: { id },
    data: { ...input, slug, filterKind },
  });
}

export async function deleteCategory(id: string) {
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) {
    throw new CategoryNotFoundError(`Category "${id}" was not found`);
  }
  if (existing._count.products > 0) {
    throw new CategoryHasProductsError(
      `Cannot delete category with ${existing._count.products} product(s) attached — reassign or remove them first`,
    );
  }

  await prisma.category.delete({ where: { id } });
}
