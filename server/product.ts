import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import type { ProductCreateInput, ProductListQuery, ProductUpdateInput } from "@/lib/validation";

export class ProductNotFoundError extends Error {}
export class DuplicateSkuError extends Error {}
export class DuplicateProductSlugError extends Error {}
export class ProductDeleteBlockedError extends Error {}
export class ProductPriceRequiredError extends Error {}

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

// `specs` is the one column Zod can only describe as "an object of some shape",
// and Prisma's Json input type won't accept `unknown` values — so the cast is
// made once, here, rather than by loosening the schema. Omitted stays omitted:
// nothing clears `specs` yet, and a plain `null` isn't valid Json input anyway
// (Prisma wants Prisma.DbNull for that, as server/fitmentProfile.ts does).
function toProductData<T extends { specs?: Record<string, unknown> }>({ specs, ...rest }: T) {
  return { ...rest, ...(specs === undefined ? {} : { specs: specs as Prisma.InputJsonValue }) };
}

export async function listProducts(query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { categoryId: query.category } : {}),
    ...(query.brand ? { brandId: query.brand } : {}),
    // The review queue (D.4). Not a truthy guard like the others: "manual" is a
    // null check, so an absent filter and "rows nobody imported" are different
    // clauses, not the same one.
    ...(query.source ? { sourceRef: query.source === "imported" ? { not: null } : null } : {}),
    // Tokenised so "Mobil 5W-30" still finds "Mobil 1 5W-30" — see
    // `lib/search.ts`. The raw query is tried against `oemPartNumbers` as well,
    // because that match is exact rather than substring: an OEM code with a
    // space in it would never survive tokenisation.
    ...(query.search
      ? {
          OR: [
            { oemPartNumbers: { has: query.search } },
            {
              AND: searchTokens(query.search).map((token) => ({
                OR: [
                  { nameEn: contains(token) },
                  { nameFa: contains(token) },
                  { sku: contains(token) },
                  // Array fields don't support substring matching in Prisma —
                  // OEM codes are matched exactly against any entry instead.
                  { oemPartNumbers: { has: token } },
                ],
              })),
            },
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
    throw new DuplicateProductSlugError(`A product with slug "${slug}" already exists`);
  }

  const product = await prisma.product.create({
    data: {
      ...toProductData(input),
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

  // A product priced at zero must not go live, however it got that way.
  //
  // The importer writes 0 when a page states no price, and most of oil-city's
  // catalog states none — 197 of the first 200 products say "ناموجود" or
  // "تماس بگیرید" instead. Zero is the schema's way of holding "unknown"
  // (Product.price is a non-nullable Decimal), but a storefront reads it as
  // free. Everything imported lands INACTIVE with zero stock, so nothing is
  // exposed by the import itself; the moment of danger is activation, and
  // D.4's review queue activates in bulk through this very function.
  //
  // Checked against the price the row will END UP with, so activating and
  // pricing in one PATCH is allowed and activating alone is not.
  const willBeActive = (input.status ?? existing.status) === "ACTIVE";
  const willBePriced = Number(input.price ?? existing.price) > 0;
  if (willBeActive && !willBePriced) {
    throw new ProductPriceRequiredError(
      `Cannot activate "${existing.nameEn || existing.nameFa}" — it has no price. ` +
        `Imported products are stored at 0 when the source stated no price; set a real one first.`,
    );
  }

  if (input.sku && input.sku !== existing.sku) {
    const conflict = await prisma.product.findUnique({
      where: { sku: input.sku },
    });
    if (conflict) {
      throw new DuplicateSkuError(`A product with SKU "${input.sku}" already exists`);
    }
  }

  // Never regenerated from a renamed nameEn — an existing product's slug is a
  // live URL, so changing it is an explicit edit only.
  if (input.slug && input.slug !== existing.slug) {
    const conflict = await prisma.product.findUnique({
      where: { slug: input.slug },
    });
    if (conflict) {
      throw new DuplicateProductSlugError(`A product with slug "${input.slug}" already exists`);
    }
  }

  // Append-only price history (Design Decision 8) — storefront checkout reads
  // it to honour a cart price captured in the last 24 hours. A row is written
  // only when price or discountPercent actually moves, so editing a name or a
  // tag leaves the history alone and every row still marks a real price change.
  // Products get no row at creation: "no row at or before this timestamp" is
  // already defined as "the current price applies".
  const priceChanged = input.price !== undefined && input.price !== Number(existing.price);
  const discountChanged =
    input.discountPercent !== undefined && input.discountPercent !== existing.discountPercent;

  const updateProductOp = prisma.product.update({
    where: { id },
    data: toProductData(input),
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
      reasons.push(`fitment profile item(s) [${fitmentIds.join(", ")}]`);
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
