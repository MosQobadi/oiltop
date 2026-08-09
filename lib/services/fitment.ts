import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

// Shared fitment resolution — the Brand → Model → Year → Engine walk plus the
// CarEngine → CarEngineFitmentProfile → FitmentProfile → FitmentProfileItem
// lookup behind it. Both the admin Fitment Preview route and the public
// storefront car-finder routes call in here so the two surfaces can never
// drift apart on what a given engine resolves to.
//
// Nothing here is auth-aware: it deliberately returns no admin-only fields
// (FitmentProfile.internalNote, FitmentProfileItem.adminNote), so the same
// payload is safe to serve unauthenticated.

export type FitmentClimate = "STANDARD" | "HOT" | "COLD";

// English-only, and only meaningful for the non-STANDARD climates — this is the
// admin Fitment Preview's chip text. The bilingual storefront localizes off the
// `climate` enum instead of rendering this string.
const CLIMATE_LABELS: Record<FitmentClimate, string | null> = {
  STANDARD: null,
  HOT: "Hot climate",
  COLD: "Cold climate",
};

export interface FitmentProductSummary {
  id: string;
  nameEn: string;
  nameFa: string;
  price: number;
  finalPrice: number;
  image: string | null;
}

export interface FitmentResolvedItem {
  id: string;
  climate: FitmentClimate;
  climateLabel: string | null;
  priority: number;
  // Null product means a spec-only recommendation: we know what the car needs,
  // the catalog just doesn't carry a matching product yet.
  product: FitmentProductSummary | null;
  specNote: string | null;
  specAttributes: Prisma.JsonValue | null;
}

export interface FitmentCategoryGroup {
  category: FitmentCategorySummary;
  items: FitmentResolvedItem[];
}

// Scoped narrower than server/fitmentProfile.ts's admin include: no adminNote,
// and the bilingual name pairs the storefront needs.
const fitmentItemInclude = {
  category: {
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      partType: true,
      filterKind: true,
    },
  },
  product: {
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      price: true,
      discountPercent: true,
      image: true,
    },
  },
} satisfies Prisma.FitmentProfileItemInclude;

export type FitmentItemWithRelations = Prisma.FitmentProfileItemGetPayload<{
  include: typeof fitmentItemInclude;
}>;

export type FitmentCategorySummary = FitmentItemWithRelations["category"];

export async function getCarModelsForBrand(carBrandId: string) {
  return prisma.carModel.findMany({
    where: { carBrandId, status: "ACTIVE" },
    orderBy: { nameEn: "asc" },
  });
}

// A model's selectable years are derived from its engines' ranges — there is no
// per-year row in the schema. A null yearEnd means "still in production", which
// expands up to the current year.
export function expandYearRanges(
  ranges: { yearStart: number; yearEnd: number | null }[],
  currentYear: number = new Date().getFullYear(),
): number[] {
  const years = new Set<number>();
  for (const range of ranges) {
    const end = range.yearEnd ?? currentYear;
    for (let year = range.yearStart; year <= end; year++) years.add(year);
  }
  // Newest first — customers pick recent model years far more often.
  return Array.from(years).sort((a, b) => b - a);
}

export async function getYearOptionsForModel(carModelId: string) {
  const engines = await prisma.carEngine.findMany({
    where: { carModelId, status: "ACTIVE" },
    select: { yearStart: true, yearEnd: true },
  });
  return expandYearRanges(engines);
}

export async function getEnginesForModelYear(carModelId: string, year: number) {
  return prisma.carEngine.findMany({
    where: {
      carModelId,
      status: "ACTIVE",
      yearStart: { lte: year },
      OR: [{ yearEnd: null }, { yearEnd: { gte: year } }],
    },
    orderBy: [{ yearStart: "asc" }, { labelEn: "asc" }],
  });
}

function toResolvedItem(item: FitmentItemWithRelations): FitmentResolvedItem {
  const climate = item.climate as FitmentClimate;
  const product = item.product;
  const price = product ? Number(product.price) : 0;

  return {
    id: item.id,
    climate,
    climateLabel: CLIMATE_LABELS[climate],
    priority: item.priority,
    product: product
      ? {
          id: product.id,
          nameEn: product.nameEn,
          nameFa: product.nameFa,
          price,
          // finalPrice isn't stored — same read-time computation as
          // server/product.ts, kept in sync with it deliberately.
          finalPrice: price * (1 - product.discountPercent / 100),
          image: product.image,
        }
      : null,
    specNote: item.specNote,
    specAttributes: item.specAttributes,
  };
}

// Categories keep the order they first appear in; items within a category are
// re-sorted by priority because an engine can have more than one profile
// attached, which interleaves two already-priority-ordered item lists. Sort is
// stable, so equal priorities keep their createdAt ordering from the query.
export function groupFitmentItemsByCategory(
  items: FitmentItemWithRelations[],
): FitmentCategoryGroup[] {
  const groups: { category: FitmentCategoryGroup["category"]; items: FitmentItemWithRelations[] }[] =
    [];
  const groupByCategoryId = new Map<string, (typeof groups)[number]>();

  for (const item of items) {
    let group = groupByCategoryId.get(item.category.id);
    if (!group) {
      group = { category: item.category, items: [] };
      groupByCategoryId.set(item.category.id, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups.map((group) => ({
    category: group.category,
    items: [...group.items]
      .sort((a, b) => a.priority - b.priority)
      .map(toResolvedItem),
  }));
}

// Flattens every item across all Fitment Profiles attached to a car engine and
// groups them by category — "what should we recommend for this engine", without
// the caller caring how many profiles happen to be linked to it. An engine with
// no profiles (or an id that doesn't exist) resolves to an empty list.
export async function resolveFitmentForEngine(
  carEngineId: string,
): Promise<FitmentCategoryGroup[]> {
  const links = await prisma.carEngineFitmentProfile.findMany({
    where: { carEngineId },
    include: {
      profile: {
        include: {
          items: {
            include: fitmentItemInclude,
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return groupFitmentItemsByCategory(links.flatMap((link) => link.profile.items));
}
