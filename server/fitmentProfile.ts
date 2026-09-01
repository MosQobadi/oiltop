import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import { previewSpecMatches } from "@/lib/services/fitment";
import type {
  FitmentProfileAttachInput,
  FitmentProfileCreateInput,
  FitmentProfileItemCreateInput,
  FitmentProfileItemUpdateInput,
  FitmentProfileListQuery,
  FitmentProfileUpdateInput,
  FitmentSpecMatchQuery,
} from "@/lib/validation";

export class FitmentProfileNotFoundError extends Error {}
export class FitmentProfileItemNotFoundError extends Error {}
export class FitmentProfileLinkedError extends Error {}

// Prisma returns Product.price as a Decimal; consumers render it with
// Number.prototype.toLocaleString(), so convert it here rather than pushing
// the Decimal-to-number concern onto every caller.
function serializeItem<T extends { product: { price: Prisma.Decimal } | null }>(item: T) {
  return {
    ...item,
    product: item.product ? { ...item.product, price: Number(item.product.price) } : null,
  };
}

// Prisma's Json fields distinguish a true SQL NULL column (Prisma.DbNull)
// from the JSON literal null (Prisma.JsonNull) — a plain `null` isn't a valid
// input for either. "Clearing" specAttributes means the former.
function toJsonInput(value: Record<string, unknown> | null | undefined) {
  if (value === null) return Prisma.DbNull;
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

// Looks up the partType of an item's category so the route layer can inject
// it into the payload as `categoryPartType` before Zod validation runs the
// climate/partType cross-field rule — see lib/validation/fitmentProfile.ts.
export async function getCategoryPartType(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { partType: true },
  });
  return category?.partType;
}

// Answers "what would this spec recommend right now?" for the item modal.
// Deliberately delegates to lib/services/fitment.ts rather than querying here:
// the admin has to be shown the same matches the storefront will resolve to,
// and the only way to guarantee that is to ask the same code.
export async function previewFitmentSpecMatches(query: FitmentSpecMatchQuery) {
  const { categoryId, ...spec } = query;
  const { total, products } = await previewSpecMatches(categoryId, spec);

  // Named, not priced: this readout exists to prove the spec means something,
  // and the storefront card is where a price belongs.
  return {
    total,
    products: products.map((product) => ({ id: product.id, nameEn: product.nameEn })),
  };
}

function withCounts<T extends { _count: { items: number; carEngineLinks: number } }>(profile: T) {
  const { _count, ...rest } = profile;
  return { ...rest, itemCount: _count.items, linkedEngineCount: _count.carEngineLinks };
}

async function ensureProfileExists(profileId: string) {
  const profile = await prisma.fitmentProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) {
    throw new FitmentProfileNotFoundError(`Fitment profile "${profileId}" was not found`);
  }
  return profile;
}

export async function listFitmentProfiles(query: FitmentProfileListQuery) {
  const where: Prisma.FitmentProfileWhereInput = {
    // Tokenised — see `lib/search.ts`. A profile label like "Peugeot 206 1.4L"
    // is one column, but tokens let the words be typed in any order.
    AND: searchTokens(query.search).map((token) => ({ label: contains(token) })),
  };

  const [fitmentProfiles, total] = await Promise.all([
    prisma.fitmentProfile.findMany({
      where,
      include: { _count: { select: { items: true, carEngineLinks: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.fitmentProfile.count({ where }),
  ]);

  return { fitmentProfiles: fitmentProfiles.map(withCounts), total };
}

export async function createFitmentProfile(input: FitmentProfileCreateInput) {
  return prisma.fitmentProfile.create({ data: input });
}

const itemInclude = {
  category: { select: { id: true, nameEn: true, partType: true } },
  product: { select: { id: true, nameEn: true, price: true, image: true } },
} satisfies Prisma.FitmentProfileItemInclude;

export async function getFitmentProfileById(id: string) {
  const profile = await prisma.fitmentProfile.findUnique({
    where: { id },
    include: {
      items: {
        include: itemInclude,
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
      carEngineLinks: {
        include: {
          carEngine: {
            include: { carModel: { include: { carBrand: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!profile) {
    throw new FitmentProfileNotFoundError(`Fitment profile "${id}" was not found`);
  }

  return {
    id: profile.id,
    label: profile.label,
    internalNote: profile.internalNote,
    oilCapacityNoFilterMl: profile.oilCapacityNoFilterMl,
    oilCapacityWithFilterMl: profile.oilCapacityWithFilterMl,
    oilViscosityStandard: profile.oilViscosityStandard,
    oilViscosityHot: profile.oilViscosityHot,
    oilViscosityCold: profile.oilViscosityCold,
    oilApiGrades: profile.oilApiGrades,
    oilGuideEn: profile.oilGuideEn,
    oilGuideFa: profile.oilGuideFa,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    items: profile.items.map(serializeItem),
    carEngineLinks: profile.carEngineLinks.map((link) => ({
      id: link.id,
      carEngine: {
        id: link.carEngine.id,
        labelEn: link.carEngine.labelEn,
        yearStart: link.carEngine.yearStart,
        yearEnd: link.carEngine.yearEnd,
        carModel: {
          id: link.carEngine.carModel.id,
          nameEn: link.carEngine.carModel.nameEn,
          carBrand: {
            id: link.carEngine.carModel.carBrand.id,
            nameEn: link.carEngine.carModel.carBrand.nameEn,
          },
        },
      },
    })),
  };
}

export async function updateFitmentProfile(id: string, input: FitmentProfileUpdateInput) {
  await ensureProfileExists(id);
  return prisma.fitmentProfile.update({ where: { id }, data: input });
}

/**
 * The stored fields the update schema compares against each other, for the
 * PATCH route to merge under a partial body before validating — the grades and
 * the two capacities. A patch that sets only the with-filter capacity still has
 * to be checked against the without-filter one already stored.
 *
 * Null when the profile does not exist; the update below raises the proper 404,
 * so this stays a lookup rather than a guard.
 */
export async function getFitmentProfileCrossFields(id: string) {
  return prisma.fitmentProfile.findUnique({
    where: { id },
    select: {
      oilViscosityStandard: true,
      oilViscosityHot: true,
      oilViscosityCold: true,
      oilCapacityNoFilterMl: true,
      oilCapacityWithFilterMl: true,
    },
  });
}

export async function deleteFitmentProfile(id: string) {
  const existing = await prisma.fitmentProfile.findUnique({
    where: { id },
    include: { _count: { select: { carEngineLinks: true } } },
  });
  if (!existing) {
    throw new FitmentProfileNotFoundError(`Fitment profile "${id}" was not found`);
  }
  if (existing._count.carEngineLinks > 0) {
    throw new FitmentProfileLinkedError(
      `Cannot delete fitment profile linked to ${existing._count.carEngineLinks} car engine(s) — detach them first`,
    );
  }

  await prisma.$transaction([
    prisma.fitmentProfileItem.deleteMany({ where: { profileId: id } }),
    prisma.fitmentProfile.delete({ where: { id } }),
  ]);
}

export async function createFitmentProfileItem(
  profileId: string,
  input: FitmentProfileItemCreateInput,
) {
  await ensureProfileExists(profileId);

  const item = await prisma.fitmentProfileItem.create({
    data: {
      profileId,
      categoryId: input.categoryId,
      climate: input.climate,
      productId: input.productId,
      specNote: input.specNote,
      specAttributes: toJsonInput(input.specAttributes),
      matchSpec: toJsonInput(input.matchSpec),
      priority: input.priority,
      adminNote: input.adminNote,
    },
    include: itemInclude,
  });
  return serializeItem(item);
}

async function ensureItemBelongsToProfile(profileId: string, itemId: string) {
  const item = await prisma.fitmentProfileItem.findUnique({ where: { id: itemId } });
  if (!item || item.profileId !== profileId) {
    throw new FitmentProfileItemNotFoundError(
      `Fitment profile item "${itemId}" was not found on profile "${profileId}"`,
    );
  }
  return item;
}

// Exposed so the route layer can re-derive the item's current categoryId
// (when a PATCH doesn't supply a new one) before running the climate/partType
// Zod rule — see lib/validation/fitmentProfile.ts.
export async function getFitmentProfileItemById(profileId: string, itemId: string) {
  return ensureItemBelongsToProfile(profileId, itemId);
}

export async function updateFitmentProfileItem(
  profileId: string,
  itemId: string,
  input: FitmentProfileItemUpdateInput,
) {
  await ensureItemBelongsToProfile(profileId, itemId);

  const item = await prisma.fitmentProfileItem.update({
    where: { id: itemId },
    data: {
      categoryId: input.categoryId,
      climate: input.climate,
      productId: input.productId,
      specNote: input.specNote,
      specAttributes: toJsonInput(input.specAttributes),
      matchSpec: toJsonInput(input.matchSpec),
      priority: input.priority,
      adminNote: input.adminNote,
    },
    include: itemInclude,
  });
  return serializeItem(item);
}

export async function deleteFitmentProfileItem(profileId: string, itemId: string) {
  await ensureItemBelongsToProfile(profileId, itemId);
  await prisma.fitmentProfileItem.delete({ where: { id: itemId } });
}

export async function attachCarEnginesToProfile(
  profileId: string,
  input: FitmentProfileAttachInput,
) {
  await ensureProfileExists(profileId);
  await prisma.carEngineFitmentProfile.createMany({
    data: input.carEngineIds.map((carEngineId) => ({ carEngineId, profileId })),
    skipDuplicates: true,
  });
}

export async function detachCarEngineFromProfile(profileId: string, carEngineId: string) {
  await prisma.carEngineFitmentProfile.deleteMany({
    where: { profileId, carEngineId },
  });
}
