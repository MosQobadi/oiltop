import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ProductNotFoundError } from "@/server/product";
import type { InventoryAddStockInput, InventoryListQuery, InventoryStatus } from "@/lib/validation";

const inventoryInclude = {
  category: { select: { id: true, nameEn: true } },
  brand: { select: { id: true, nameEn: true } },
  inventory: { select: { stock: true, lastUpdatedAt: true } },
} satisfies Prisma.ProductInclude;

type ProductWithInventory = Prisma.ProductGetPayload<{
  include: typeof inventoryInclude;
}>;

// Thresholds documented on the Inventory model in schema.prisma.
export function deriveInventoryStatus(stock: number): InventoryStatus {
  if (stock === 0) return "OUT_OF_STOCK";
  if (stock < 10) return "LOW_STOCK";
  return "IN_STOCK";
}

function toInventoryResponse(product: ProductWithInventory) {
  const { inventory, ...rest } = product;
  const stock = inventory?.stock ?? 0;
  return {
    ...rest,
    stock,
    lastUpdatedAt: inventory?.lastUpdatedAt ?? null,
    status: deriveInventoryStatus(stock),
  };
}

function stockFilterForStatus(status?: InventoryStatus): Prisma.IntFilter | undefined {
  switch (status) {
    case "OUT_OF_STOCK":
      return { equals: 0 };
    case "LOW_STOCK":
      return { gt: 0, lt: 10 };
    case "IN_STOCK":
      return { gte: 10 };
    default:
      return undefined;
  }
}

export async function listInventory(query: InventoryListQuery) {
  const stockFilter = stockFilterForStatus(query.status);

  const where: Prisma.ProductWhereInput = {
    ...(query.category ? { categoryId: query.category } : {}),
    ...(query.brand ? { brandId: query.brand } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: query.search, mode: "insensitive" } },
            { nameFa: { contains: query.search, mode: "insensitive" } },
            { sku: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(stockFilter ? { inventory: { stock: stockFilter } } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: inventoryInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: products.map(toInventoryResponse), total };
}

export async function addInventoryStock(
  productId: string,
  input: InventoryAddStockInput,
) {
  const existing = await prisma.inventory.findUnique({ where: { productId } });
  if (!existing) {
    throw new ProductNotFoundError(`Product "${productId}" was not found`);
  }

  const inventory = await prisma.inventory.update({
    where: { productId },
    data: {
      stock: { increment: input.addStock },
      lastUpdatedAt: new Date(),
    },
  });

  return {
    productId,
    stock: inventory.stock,
    status: deriveInventoryStatus(inventory.stock),
    lastUpdatedAt: inventory.lastUpdatedAt,
  };
}
