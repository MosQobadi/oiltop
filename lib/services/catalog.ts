import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { StorefrontProductListQuery, StorefrontProductSort } from "@/lib/validation";

// Public catalog reads — the PLP list, the PDP lookup, and the back-in-stock
// signup behind them. Sibling of lib/services/fitment.ts and follows the same
// two rules: nothing here is auth-aware, and every projection is explicit so a
// new admin-only column can't be published by accident.
//
// ACTIVE-only is enforced up the whole chain, not just on the row being asked
// for: a product in a deactivated category or from a deactivated brand is not
// visible to customers, the same way fitment.ts hides a model whose car brand
// is inactive.

// Stock is never exposed as a number. Customers get "out of stock" (blocks the
// buy button) and "low stock" (urgency); anything at or above the low-stock
// threshold returns null, because "we have plenty" needs no badge and the exact
// count is nobody's business outside the admin panel. Thresholds are the ones
// documented on the Inventory model in schema.prisma and implemented in
// server/inventory.ts' deriveInventoryStatus.
export type StorefrontStockStatus = "OUT_OF_STOCK" | "LOW_STOCK";

const LOW_STOCK_THRESHOLD = 10;

export function deriveStorefrontStockStatus(stock: number): StorefrontStockStatus | null {
  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock < LOW_STOCK_THRESHOLD) return "LOW_STOCK";
  return null;
}

const categorySelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  image: true,
  partType: true,
  filterKind: true,
} satisfies Prisma.CategorySelect;

const brandSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  logo: true,
} satisfies Prisma.BrandSelect;

// The category landing page needs more than a filter option does: hero copy and
// the SEO pair. Kept separate from categorySelect so the PLP sidebar doesn't
// drag description columns along for every category it lists.
const categoryDetailSelect = {
  ...categorySelect,
  shortDescriptionEn: true,
  shortDescriptionFa: true,
  metaTitleEn: true,
  metaTitleFa: true,
  metaDescriptionEn: true,
  metaDescriptionFa: true,
} satisfies Prisma.CategorySelect;

export type StorefrontCategory = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;
export type StorefrontCategoryDetail = Prisma.CategoryGetPayload<{
  select: typeof categoryDetailSelect;
}>;
export type StorefrontBrand = Prisma.BrandGetPayload<{
  select: typeof brandSelect;
}>;

// PLP cards need less than the PDP: no long descriptions, no SEO meta.
const productCardSelect = {
  id: true,
  slug: true,
  sku: true,
  nameEn: true,
  nameFa: true,
  shortDescriptionEn: true,
  shortDescriptionFa: true,
  price: true,
  discountPercent: true,
  tags: true,
  image: true,
  createdAt: true,
  category: { select: categorySelect },
  brand: { select: brandSelect },
  inventory: { select: { stock: true } },
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
  ...productCardSelect,
  oemPartNumbers: true,
  longDescriptionEn: true,
  longDescriptionFa: true,
  metaTitleEn: true,
  metaTitleFa: true,
  metaDescriptionEn: true,
  metaDescriptionFa: true,
} satisfies Prisma.ProductSelect;

type ProductCardRow = Prisma.ProductGetPayload<{
  select: typeof productCardSelect;
}>;
type ProductDetailRow = Prisma.ProductGetPayload<{
  select: typeof productDetailSelect;
}>;

function toPublicProduct<T extends ProductCardRow>(product: T) {
  const { inventory, price, discountPercent, ...rest } = product;
  const priceNumber = Number(price);
  return {
    ...rest,
    price: priceNumber,
    discountPercent,
    // finalPrice isn't stored — same read-time computation as
    // server/product.ts and lib/services/fitment.ts.
    finalPrice: priceNumber * (1 - discountPercent / 100),
    stockStatus: deriveStorefrontStockStatus(inventory?.stock ?? 0),
  };
}

export type StorefrontProductCard = ReturnType<typeof toPublicProduct<ProductCardRow>>;

export async function listActiveCategories(): Promise<StorefrontCategory[]> {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    select: categorySelect,
    orderBy: { nameEn: "asc" },
  });
}

// The landing page's lookup. An inactive category is a 404 rather than an empty
// page, the same rule getStorefrontProductBySlug applies to a deactivated
// product — an unlisted category shouldn't keep answering 200 to a crawler.
export async function getStorefrontCategoryBySlug(
  slug: string,
): Promise<StorefrontCategoryDetail | null> {
  return prisma.category.findFirst({
    where: { slug, status: "ACTIVE" },
    select: categoryDetailSelect,
  });
}

export async function listActiveProductBrands(): Promise<StorefrontBrand[]> {
  return prisma.brand.findMany({
    where: { status: "ACTIVE" },
    select: brandSelect,
    orderBy: { nameEn: "asc" },
  });
}

// Storefront URLs carry slugs (`?category=engine-oil`), but the car-finder
// hands the PLP ids it already resolved. Accepting either keeps both callers
// honest without a lookup round-trip; slugs and cuids can't collide because a
// cuid contains no hyphens and slugSchema requires lowercase alphanumerics.
function slugOrIdFilter(value: string) {
  return { OR: [{ id: value }, { slug: value }] };
}

function buildProductWhere(query: StorefrontProductListQuery): Prisma.ProductWhereInput {
  return {
    status: "ACTIVE",
    category: {
      is: {
        status: "ACTIVE",
        ...(query.category ? slugOrIdFilter(query.category) : {}),
        ...(query.partType ? { partType: query.partType } : {}),
        ...(query.filterKind ? { filterKind: query.filterKind } : {}),
      },
    },
    brand: {
      is: {
        status: "ACTIVE",
        ...(query.brand ? slugOrIdFilter(query.brand) : {}),
      },
    },
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: query.search, mode: "insensitive" } },
            { nameFa: { contains: query.search, mode: "insensitive" } },
            // Array columns can't do substring matching in Prisma — OEM codes
            // match an exact entry, same as the admin Products search.
            { oemPartNumbers: { has: query.search } },
          ],
        }
      : {}),
  };
}

// finalPrice is computed, not stored, so the database can't order by it: two
// products can swap places once their discounts differ. For the price sorts we
// pull the (small) id/price/discount projection for the whole filtered set,
// order it in memory, and then fetch only the page's rows. Fine for a catalog
// of this size; if it ever outgrows that, this is the function to replace with
// a raw ordered query, not the callers.
async function findProductIdsSortedByFinalPrice(
  where: Prisma.ProductWhereInput,
  sort: Extract<StorefrontProductSort, "price-asc" | "price-desc">,
  skip: number,
  take: number,
): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where,
    select: { id: true, price: true, discountPercent: true },
  });

  const direction = sort === "price-asc" ? 1 : -1;
  return rows
    .map((row) => ({
      id: row.id,
      finalPrice: Number(row.price) * (1 - row.discountPercent / 100),
    }))
    .sort((a, b) => (a.finalPrice - b.finalPrice) * direction)
    .slice(skip, skip + take)
    .map((row) => row.id);
}

export async function listStorefrontProducts(
  query: StorefrontProductListQuery,
): Promise<{ products: StorefrontProductCard[]; total: number }> {
  const where = buildProductWhere(query);
  const skip = (query.page - 1) * query.pageSize;

  if (query.sort === "price-asc" || query.sort === "price-desc") {
    const [ids, total] = await Promise.all([
      findProductIdsSortedByFinalPrice(where, query.sort, skip, query.pageSize),
      prisma.product.count({ where }),
    ]);

    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: productCardSelect,
    });
    // findMany ignores the order of `in`, so restore the sorted order here.
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const products = ids
      .map((id) => rowsById.get(id))
      .filter((row): row is ProductCardRow => row !== undefined)
      .map(toPublicProduct);

    return { products, total };
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productCardSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products: rows.map(toPublicProduct), total };
}

// One entry per car engine this product is recommended for, flattened out of
// every Fitment Profile that references it — "this fits: BMW X6 2006-2016
// (3.0si)". Inactive engines/models/brands are excluded, and an engine reached
// through two different profiles is listed once.
export interface FittingCarEngine {
  carEngineId: string;
  labelEn: string;
  labelFa: string;
  yearStart: number;
  yearEnd: number | null;
  carModel: { id: string; slug: string; nameEn: string; nameFa: string };
  carBrand: { id: string; slug: string; nameEn: string; nameFa: string };
}

async function getFittingCarEngines(productId: string): Promise<FittingCarEngine[]> {
  const links = await prisma.carEngineFitmentProfile.findMany({
    where: {
      profile: { items: { some: { productId } } },
      carEngine: {
        status: "ACTIVE",
        carModel: { status: "ACTIVE", carBrand: { status: "ACTIVE" } },
      },
    },
    select: {
      carEngine: {
        select: {
          id: true,
          labelEn: true,
          labelFa: true,
          yearStart: true,
          yearEnd: true,
          carModel: {
            select: {
              id: true,
              slug: true,
              nameEn: true,
              nameFa: true,
              carBrand: {
                select: { id: true, slug: true, nameEn: true, nameFa: true },
              },
            },
          },
        },
      },
    },
  });

  const byEngineId = new Map<string, FittingCarEngine>();
  for (const { carEngine } of links) {
    if (byEngineId.has(carEngine.id)) continue;
    const { carModel, ...engine } = carEngine;
    const { carBrand, ...model } = carModel;
    byEngineId.set(carEngine.id, {
      carEngineId: engine.id,
      labelEn: engine.labelEn,
      labelFa: engine.labelFa,
      yearStart: engine.yearStart,
      yearEnd: engine.yearEnd,
      carModel: model,
      carBrand,
    });
  }

  return Array.from(byEngineId.values()).sort((a, b) => {
    const brand = a.carBrand.nameEn.localeCompare(b.carBrand.nameEn);
    if (brand !== 0) return brand;
    const model = a.carModel.nameEn.localeCompare(b.carModel.nameEn);
    if (model !== 0) return model;
    return a.yearStart - b.yearStart;
  });
}

export type StorefrontProductDetail = ReturnType<typeof toPublicProduct<ProductDetailRow>> & {
  fitsCarEngines: FittingCarEngine[];
};

export async function getStorefrontProductBySlug(
  slug: string,
): Promise<StorefrontProductDetail | null> {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    select: productDetailSelect,
  });
  if (!product) return null;

  return {
    ...toPublicProduct(product),
    fitsCarEngines: await getFittingCarEngines(product.id),
  };
}

// notify-me arrives with the id the PDP payload carried, but the PDP itself is
// addressed by slug — accepting either means the storefront never has to hold
// on to a second identifier.
export async function getActiveProductByIdOrSlug(idOrSlug: string) {
  return prisma.product.findFirst({
    where: {
      ...slugOrIdFilter(idOrSlug),
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    select: { id: true, inventory: { select: { stock: true } } },
  });
}

// Re-submitting the same contact for the same product returns the pending row
// instead of stacking duplicates — the PDP form has no idea whether this
// browser already signed up, and the restock notifier would otherwise email
// the same person twice. A contact that was already notified can sign up again
// (the product went out of stock a second time), so only un-notified rows are
// reused.
export async function createStockNotification(productId: string, contact: string) {
  const pending = await prisma.stockNotification.findFirst({
    where: { productId, contact, notifiedAt: null },
    select: { id: true, productId: true, contact: true, createdAt: true },
  });
  if (pending) return pending;

  return prisma.stockNotification.create({
    data: { productId, contact },
    select: { id: true, productId: true, contact: true, createdAt: true },
  });
}
