import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  FitmentProfileAttachInput,
  FitmentProfileCreateInput,
  FitmentProfileItemCreateInput,
  FitmentProfileItemUpdateInput,
  FitmentProfileListQuery,
  FitmentProfileUpdateInput,
} from "@/lib/validation";

export class FitmentProfileNotFoundError extends Error {}
export class FitmentProfileItemNotFoundError extends Error {}
export class FitmentProfileLinkedError extends Error {}

// Prisma returns Product.price as a Decimal; consumers render it with
// Number.prototype.toLocaleString(), so convert it here rather than pushing
// the Decimal-to-number concern onto every caller.
function serializeItem<T extends { product: { price: Prisma.Decimal } | null }>(
  item: T,
) {
  return {
    ...item,
    product: item.product
      ? { ...item.product, price: Number(item.product.price) }
      : null,
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

function withCounts<T extends { _count: { items: number; carEngineLinks: number } }>(
  profile: T,
) {
  const { _count, ...rest } = profile;
  return { ...rest, itemCount: _count.items, linkedEngineCount: _count.carEngineLinks };
}

async function ensureProfileExists(profileId: string) {
  const profile = await prisma.fitmentProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) {
    throw new FitmentProfileNotFoundError(
      `Fitment profile "${profileId}" was not found`,
    );
  }
  return profile;
}

export async function listFitmentProfiles(query: FitmentProfileListQuery) {
  const where: Prisma.FitmentProfileWhereInput = {
    ...(query.search
      ? { label: { contains: query.search, mode: "insensitive" } }
      : {}),
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

export async function updateFitmentProfile(
  id: string,
  input: FitmentProfileUpdateInput,
) {
  await ensureProfileExists(id);
  return prisma.fitmentProfile.update({ where: { id }, data: input });
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

export async function detachCarEngineFromProfile(
  profileId: string,
  carEngineId: string,
) {
  await prisma.carEngineFitmentProfile.deleteMany({
    where: { profileId, carEngineId },
  });
}

// Flattens every item across all Fitment Profiles attached to a car engine —
// the read path the Fitment Preview tool (and eventually the storefront) uses
// to resolve "what should we recommend for this engine" without caring how
// many profiles happen to be linked to it.
export async function getResolvedFitmentForCarEngine(carEngineId: string) {
  const links = await prisma.carEngineFitmentProfile.findMany({
    where: { carEngineId },
    include: {
      profile: {
        include: {
          items: {
            include: itemInclude,
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  return links.flatMap((link) => link.profile.items.map(serializeItem));
}
