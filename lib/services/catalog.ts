import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import { MAX_CART_QUANTITY } from "@/lib/storefront/cart";
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

// What a customer needs to recognise and reach a category. `partType` is
// deliberately absent: it says how a category behaves, which is the fitment
// engine's business (see PartType in prisma/schema.prisma), not something a
// product card or a filter option has any use for.
const categorySelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  image: true,
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
  // The PDP's spec list. `specs` stays out until something is written to it —
  // the free-form column has no display rules yet.
  viscosity: true,
  apiGrade: true,
  volumeMl: true,
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
    // Computed here rather than read off Product.finalPrice: that column is a
    // Decimal the database maintains for sorting (see schema.prisma), and this
    // is the same read-time arithmetic server/product.ts and
    // lib/services/fitment.ts do.
    finalPrice: priceNumber * (1 - discountPercent / 100),
    stockStatus: deriveStorefrontStockStatus(inventory?.stock ?? 0),
  };
}

export type StorefrontProductCard = ReturnType<typeof toPublicProduct<ProductCardRow>>;

export async function listActiveCategories(): Promise<StorefrontCategory[]> {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    select: categorySelect,
    // Pinned categories first in the admin's order, everything unordered after
    // them alphabetically — name also breaks a tie between equal numbers.
    // `sortOrder` itself stays out of the payload: it orders the list, it isn't
    // something a nav link or a filter option renders.
    orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { nameEn: "asc" }],
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

// Every place the storefront presents brands *as a list to choose from*: the
// homepage wall, the PLP sidebar, the category page's filter rail.
//
// `showInBrandLists` is the second half of the filter and it is not the same
// question as `status`. ACTIVE means the brand's products can be bought;
// showInBrandLists means the brand itself is worth putting in front of a
// customer. They come apart because the import mints a Brand from whatever the
// source printed after "برند :", which for an OEM part is the car it fits — so
// this table holds ACTIVE rows named هیوندای and پراید whose products are real
// and must keep selling. See the field's comment in prisma/schema.prisma.
export async function listActiveProductBrands(): Promise<StorefrontBrand[]> {
  return prisma.brand.findMany({
    where: { status: "ACTIVE", showInBrandLists: true },
    select: brandSelect,
    // Pinned brands first in the admin's order, everything unordered after them
    // alphabetically — name also breaks a tie between equal numbers.
    // `sortOrder` itself stays out of the payload: it orders the list, it isn't
    // something a brand card or a filter option renders.
    orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { nameEn: "asc" }],
  });
}

// The homepage rail. "Deals" here means two things a customer recognises as one
// shelf — the deepest discounts, and what everyone else is buying — so the two
// lists are taken separately and merged rather than blended into a single score
// nobody could explain: a best-seller at full price still earns its place, and a
// 30%-off product nobody has ordered yet still shows up.
//
// Units sold counts every order that wasn't cancelled, at any fulfilment stage:
// a pending order is a sale a customer made. There is no time window — the
// catalog is young enough that "ever" and "recently" are the same list, and a
// window is easy to add here later without any caller noticing.
const DEALS_LIMIT = 20;

async function findBestSellerProductIds(limit: number): Promise<string[]> {
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { status: { not: "CANCELLED" } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });
  return rows.map((row) => row.productId);
}

export async function listStorefrontDeals(limit = DEALS_LIMIT): Promise<StorefrontProductCard[]> {
  // The same ACTIVE-everywhere rule the PLP applies, minus the query filters.
  const visible: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    category: { is: { status: "ACTIVE" } },
    brand: { is: { status: "ACTIVE" } },
  };

  const [discounted, bestSellerIds] = await Promise.all([
    prisma.product.findMany({
      where: { ...visible, discountPercent: { gt: 0 } },
      select: productCardSelect,
      orderBy: [{ discountPercent: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
    findBestSellerProductIds(limit),
  ]);

  // Ordered by units sold, so the ranking survives the round-trip that `in`
  // loses — and re-filtered through `visible`, because an order can reference a
  // product that has since been deactivated.
  const bestSellerRows = await prisma.product.findMany({
    where: { ...visible, id: { in: bestSellerIds } },
    select: productCardSelect,
  });
  const bestSellersById = new Map(bestSellerRows.map((row) => [row.id, row]));
  const bestSellers = bestSellerIds
    .map((id) => bestSellersById.get(id))
    .filter((row): row is ProductCardRow => row !== undefined);

  // Discounts lead — that's the shelf's headline — and the best-sellers fill in
  // behind them, each product once.
  const merged = new Map<string, ProductCardRow>();
  for (const row of [...discounted, ...bestSellers]) {
    if (!merged.has(row.id)) merged.set(row.id, row);
  }

  return [...merged.values()].slice(0, limit).map(toPublicProduct);
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
      },
    },
    brand: {
      is: {
        status: "ACTIVE",
        ...(query.brand ? slugOrIdFilter(query.brand) : {}),
      },
    },
    // Tokenised, and the raw query still tried whole against `oemPartNumbers` —
    // same shape as the admin Products search, so the two stay consistent.
    // See `lib/search.ts`.
    ...(query.search
      ? {
          OR: [
            { oemPartNumbers: { has: query.search } },
            {
              AND: searchTokens(query.search).map((token) => ({
                OR: [
                  { nameEn: contains(token) },
                  { nameFa: contains(token) },
                  // Array columns can't do substring matching in Prisma — OEM
                  // codes match an exact entry, same as the admin search.
                  { oemPartNumbers: { has: token } },
                ],
              })),
            },
          ],
        }
      : {}),
  };
}

// Every sort is an indexed ORDER BY. The price sorts read `finalPrice`, the
// stored generated column (see prisma/schema.prisma) — the discounted price is
// computed by the database on write, so ordering by it needs no second query
// and no sort in Node.
//
// `id` breaks ties in every case: LIMIT/OFFSET paging needs a total order, or a
// page boundary landing inside a group of equally-priced products can show one
// of them twice and none of the next.
function productOrderBy(sort: StorefrontProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ finalPrice: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ finalPrice: "desc" }, { id: "asc" }];
    case "newest":
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

export async function listStorefrontProducts(
  query: StorefrontProductListQuery,
): Promise<{ products: StorefrontProductCard[]; total: number }> {
  const where = buildProductWhere(query);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productCardSelect,
      orderBy: productOrderBy(query.sort),
      skip: (query.page - 1) * query.pageSize,
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

// The same product in another size — one row per sibling sharing this one's
// `variantGroup`. Narrow on purpose: the size selector needs a link, a label,
// and the volume to order by, and nothing else on the PDP reads this list.
export interface ProductSizeSibling {
  id: string;
  slug: string;
  nameEn: string;
  nameFa: string;
  volumeMl: number | null;
}

// Ascending by volume, so 1 L / 4 L / 5 L reads in the order a customer expects
// rather than in insertion order. A sibling with no volume recorded sorts last
// and falls back to its name on the page — an unlabelled size is still a real
// product, and dropping it would hide it from the only place it's linked.
async function listProductSizeSiblings(
  variantGroup: string | null,
  productId: string,
): Promise<ProductSizeSibling[]> {
  if (variantGroup === null) return [];

  return prisma.product.findMany({
    where: {
      variantGroup,
      id: { not: productId },
      // Same ACTIVE-up-the-chain rule the product itself is fetched under: a
      // size the PDP wouldn't serve is a size it shouldn't link to.
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    select: { id: true, slug: true, nameEn: true, nameFa: true, volumeMl: true },
    orderBy: [{ volumeMl: { sort: "asc", nulls: "last" } }, { nameEn: "asc" }],
  });
}

export type StorefrontProductDetail = ReturnType<typeof toPublicProduct<ProductDetailRow>> & {
  fitsCarEngines: FittingCarEngine[];
  sizeSiblings: ProductSizeSibling[];
};

export async function getStorefrontProductBySlug(
  slug: string,
): Promise<StorefrontProductDetail | null> {
  const row = await prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    // variantGroup is the key the siblings are looked up by, not something a
    // customer is shown — it comes off the row here and no further.
    select: { ...productDetailSelect, variantGroup: true },
  });
  if (!row) return null;

  const { variantGroup, ...product } = row;
  const [fitsCarEngines, sizeSiblings] = await Promise.all([
    getFittingCarEngines(product.id),
    listProductSizeSiblings(variantGroup, product.id),
  ]);

  return { ...toPublicProduct(product), fitsCarEngines, sizeSiblings };
}

// --- Cart line lookup ------------------------------------------------------

// What a stored cart line has to be re-read against. Deliberately narrow: the
// cart already has the snapshot it took on add, and re-reads it only to answer
// "can this still be bought, at what price, and how many".
export interface StorefrontCartProduct {
  productId: string;
  slug: string;
  nameEn: string;
  nameFa: string;
  image: string | null;
  price: number;
  finalPrice: number;
  stockStatus: StorefrontStockStatus | null;
  /**
   * How many units of this line an order may actually contain — the real stock
   * count, capped at MAX_CART_QUANTITY.
   *
   * This is the one place the storefront publishes a stock *number*, and it's a
   * deliberate exception to the rule above: a cart that can't tell the customer
   * "only 3 left" can only let them build an order checkout will reject. The
   * cap is what keeps the disclosure to the minimum that buys that — a
   * well-stocked product reports 99 and says nothing about the warehouse.
   */
  maxQuantity: number;
}

const cartProductSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  image: true,
  price: true,
  discountPercent: true,
  inventory: { select: { stock: true } },
} satisfies Prisma.ProductSelect;

// Ids come off the client's localStorage cart, so anything that no longer
// resolves — deleted, deactivated, or sitting under a deactivated category or
// brand — is simply absent from the result. The caller reads a missing id as
// "no longer purchasable" rather than as an error, which is the same answer for
// all of those cases.
export async function listStorefrontCartProducts(
  productIds: string[],
): Promise<StorefrontCartProduct[]> {
  if (productIds.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    select: cartProductSelect,
  });

  return rows.map(({ id, inventory, price, discountPercent, ...rest }) => {
    const priceNumber = Number(price);
    const stock = inventory?.stock ?? 0;
    return {
      ...rest,
      productId: id,
      price: priceNumber,
      finalPrice: priceNumber * (1 - discountPercent / 100),
      stockStatus: deriveStorefrontStockStatus(stock),
      maxQuantity: Math.min(Math.max(stock, 0), MAX_CART_QUANTITY),
    };
  });
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
