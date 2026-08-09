import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { sendNotification } from "@/lib/notify";
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

// Back-in-stock alerts (Design Decision 9). Rows are claimed with an atomic
// updateMany *before* anything is sent, and only the rows this call flipped are
// read back — so a concurrent restock or a repeated PATCH can never contact the
// same subscriber twice. The trade-off is the opposite failure: if the provider
// is down the alert is lost rather than duplicated, which is the right way
// round for an unsolicited marketing-adjacent message.
async function notifyRestockSubscribers(productId: string) {
  const notifiedAt = new Date();
  const { count } = await prisma.stockNotification.updateMany({
    where: { productId, notifiedAt: null },
    data: { notifiedAt },
  });
  if (count === 0) return;

  const [product, claimed] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { nameEn: true },
    }),
    prisma.stockNotification.findMany({
      where: { productId, notifiedAt },
      select: { contact: true },
    }),
  ]);

  const productName = product?.nameEn ?? "A product you asked about";

  await Promise.all(
    claimed.map((subscriber) =>
      sendNotification({
        to: subscriber.contact,
        subject: `${productName} is back in stock`,
        body: `${productName} is available again at Top Oil.`,
        // A failed send must not fail the admin's restock — the stock update
        // is already committed by this point.
      }).catch((error: unknown) => {
        console.error(
          `[notify] back-in-stock alert failed for product ${productId}`,
          error,
        );
      }),
    ),
  );
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

  // Only the 0 -> >0 edge notifies: topping up an already-stocked product isn't
  // news to anyone waiting.
  if (existing.stock === 0 && inventory.stock > 0) {
    await notifyRestockSubscribers(productId);
  }

  return {
    productId,
    stock: inventory.stock,
    status: deriveInventoryStatus(inventory.stock),
    lastUpdatedAt: inventory.lastUpdatedAt,
  };
}
