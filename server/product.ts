import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
} from "@/lib/validation";

export class ProductNotFoundError extends Error {}
export class DuplicateSkuError extends Error {}
export class DuplicateProductSlugError extends Error {}
export class ProductDeleteBlockedError extends Error {}

const productInclude = {
  category: { select: { id: true, nameEn: true } },
  brand: { select: { id: true, nameEn: true } },
  inventory: { select: { stock: true } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

function toProductResponse(product: ProductWithRelations) {
  const { inventory, price, discountPercent, ...rest } = product;
  const priceNumber = Number(price);
  return {
    ...rest,
    price: priceNumber,
    discountPercent,
    finalPrice: priceNumber * (1 - discountPercent / 100),
    stock: inventory?.stock ?? 0,
  };
}

export async function listProducts(query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { categoryId: query.category } : {}),
    ...(query.brand ? { brandId: query.brand } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: query.search, mode: "insensitive" } },
            { nameFa: { contains: query.search, mode: "insensitive" } },
            { sku: { contains: query.search, mode: "insensitive" } },
            // Array fields don't support substring matching in Prisma — OEM
            // codes are matched exactly against any entry instead.
            { oemPartNumbers: { has: query.search } },
          ],
        }
      : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products: products.map(toProductResponse), total };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productInclude,
  });
  if (!product) {
    throw new ProductNotFoundError(`Product "${id}" was not found`);
  }
  return toProductResponse(product);
}

export async function createProduct(input: ProductCreateInput) {
  const existing = await prisma.product.findUnique({
    where: { sku: input.sku },
  });
  if (existing) {
    throw new DuplicateSkuError(`A product with SKU "${input.sku}" already exists`);
  }

  const slug = input.slug ?? slugify(input.nameEn);
  const slugConflict = await prisma.product.findUnique({ where: { slug } });
  if (slugConflict) {
    throw new DuplicateProductSlugError(
      `A product with slug "${slug}" already exists`,
    );
  }

  const product = await prisma.product.create({
    data: {
      ...input,
      slug,
      inventory: { create: { stock: 0, lastUpdatedAt: new Date() } },
    },
    include: productInclude,
  });
  return toProductResponse(product);
}

export async function updateProduct(id: string, input: ProductUpdateInput) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductNotFoundError(`Product "${id}" was not found`);
  }

  if (input.sku && input.sku !== existing.sku) {
    const conflict = await prisma.product.findUnique({
      where: { sku: input.sku },
    });
    if (conflict) {
      throw new DuplicateSkuError(
        `A product with SKU "${input.sku}" already exists`,
      );
    }
  }

  // Never regenerated from a renamed nameEn — an existing product's slug is a
  // live URL, so changing it is an explicit edit only.
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.product.findUnique({
      where: { slug: input.slug },
    });
    if (conflict) {
      throw new DuplicateProductSlugError(
        `A product with slug "${input.slug}" already exists`,
      );
    }
  }

  // Append-only price history (Design Decision 8) — storefront checkout reads
  // it to honour a cart price captured in the last 24 hours. A row is written
  // only when price or discountPercent actually moves, so editing a name or a
  // tag leaves the history alone and every row still marks a real price change.
  // Products get no row at creation: "no row at or before this timestamp" is
  // already defined as "the current price applies".
  const priceChanged =
    input.price !== undefined && input.price !== Number(existing.price);
  const discountChanged =
    input.discountPercent !== undefined &&
    input.discountPercent !== existing.discountPercent;

  const updateProductOp = prisma.product.update({
    where: { id },
    data: input,
    include: productInclude,
  });

  if (!priceChanged && !discountChanged) {
    return toProductResponse(await updateProductOp);
  }

  const [product] = await prisma.$transaction([
    updateProductOp,
    prisma.productPriceLog.create({
      data: {
        productId: id,
        price: input.price ?? existing.price,
        discountPercent: input.discountPercent ?? existing.discountPercent,
      },
    }),
  ]);
  return toProductResponse(product);
}

export async function deleteProduct(id: string) {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: {
      _count: { select: { orderItems: true } },
      fitmentProfileItems: { select: { id: true } },
    },
  });
  if (!existing) {
    throw new ProductNotFoundError(`Product "${id}" was not found`);
  }

  const orderItemCount = existing._count.orderItems;
  const fitmentIds = existing.fitmentProfileItems.map((f) => f.id);

  if (orderItemCount > 0 || fitmentIds.length > 0) {
    await prisma.product.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    const reasons: string[] = [];
    if (orderItemCount > 0) {
      reasons.push(`${orderItemCount} order item(s)`);
    }
    if (fitmentIds.length > 0) {
      reasons.push(
        `fitment profile item(s) [${fitmentIds.join(", ")}]`,
      );
    }
    throw new ProductDeleteBlockedError(
      `Cannot delete product — referenced by ${reasons.join(" and ")}. Deactivated instead.`,
    );
  }

  // Price history and back-in-stock signups are meaningless without the
  // product and nothing else references them, so they go with it rather than
  // blocking the delete on a foreign key.
  await prisma.$transaction([
    prisma.inventory.deleteMany({ where: { productId: id } }),
    prisma.productPriceLog.deleteMany({ where: { productId: id } }),
    prisma.stockNotification.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);
}
