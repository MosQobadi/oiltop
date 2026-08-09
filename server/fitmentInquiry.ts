import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  FitmentInquiryListQuery,
  FitmentInquiryPatchInput,
  StorefrontFitmentInquiryCreateInput,
} from "@/lib/validation";

export class FitmentInquiryNotFoundError extends Error {}
export class UnknownFitmentInquiryReferenceError extends Error {}

const listInclude = {
  carEngine: {
    include: { carModel: { include: { carBrand: true } } },
  },
  category: { select: { id: true, nameEn: true } },
} satisfies Prisma.FitmentInquiryInclude;

function carEngineLabel(
  carEngine: Prisma.FitmentInquiryGetPayload<{ include: typeof listInclude }>["carEngine"],
) {
  if (!carEngine) return null;
  return `${carEngine.carModel.carBrand.nameEn} ${carEngine.carModel.nameEn} ${carEngine.labelEn} (${carEngine.yearStart}–${carEngine.yearEnd ?? "Present"})`;
}

function toFitmentInquiryListItem(
  inquiry: Prisma.FitmentInquiryGetPayload<{ include: typeof listInclude }>,
) {
  return {
    id: inquiry.id,
    customerName: inquiry.customerName,
    phone: inquiry.phone,
    email: inquiry.email,
    carEngineLabel: carEngineLabel(inquiry.carEngine),
    categoryName: inquiry.category?.nameEn ?? null,
    status: inquiry.status,
    createdAt: inquiry.createdAt,
  };
}

// The only write on this model the customer drives: when the car finder
// resolves to nothing (or to a spec-only recommendation with no product behind
// it), the storefront captures a lead instead of dead-ending them. Admins then
// work the row from the Fitment Inquiries screen, which is why it always
// starts at NEW — the public route has no say in the status.
//
// carEngineId/categoryId come from the car finder and are checked before the
// insert: a stale or forged id would otherwise surface as a Prisma
// foreign-key 500 on a form the customer filled in correctly. An INACTIVE
// engine or category is still accepted — the reference is context for the
// admin, and deactivating a car model shouldn't start rejecting leads about it.
export async function createFitmentInquiry(input: StorefrontFitmentInquiryCreateInput) {
  if (input.carEngineId) {
    const carEngine = await prisma.carEngine.findUnique({
      where: { id: input.carEngineId },
      select: { id: true },
    });
    if (!carEngine) {
      throw new UnknownFitmentInquiryReferenceError("Unknown car engine");
    }
  }

  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new UnknownFitmentInquiryReferenceError("Unknown category");
    }
  }

  return prisma.fitmentInquiry.create({
    data: {
      customerName: input.customerName,
      phone: input.phone,
      email: input.email ?? null,
      message: input.message ?? null,
      carEngineId: input.carEngineId ?? null,
      categoryId: input.categoryId ?? null,
      status: "NEW",
    },
    // No adminNote, and no echo of the whole row — this response goes to a
    // customer, and the form only needs enough back to render a confirmation.
    select: {
      id: true,
      customerName: true,
      phone: true,
      email: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function listFitmentInquiries(query: FitmentInquiryListQuery) {
  const where: Prisma.FitmentInquiryWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { customerName: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [inquiries, total] = await Promise.all([
    prisma.fitmentInquiry.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.fitmentInquiry.count({ where }),
  ]);

  return { items: inquiries.map(toFitmentInquiryListItem), total };
}

export async function getFitmentInquiryById(id: string) {
  const inquiry = await prisma.fitmentInquiry.findUnique({
    where: { id },
    include: listInclude,
  });
  if (!inquiry) {
    throw new FitmentInquiryNotFoundError(`Fitment inquiry "${id}" was not found`);
  }

  return {
    id: inquiry.id,
    customerName: inquiry.customerName,
    phone: inquiry.phone,
    email: inquiry.email,
    message: inquiry.message,
    carEngine: inquiry.carEngine
      ? { id: inquiry.carEngine.id, label: carEngineLabel(inquiry.carEngine) }
      : null,
    category: inquiry.category,
    status: inquiry.status,
    adminNote: inquiry.adminNote,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };
}

export async function updateFitmentInquiry(id: string, input: FitmentInquiryPatchInput) {
  const existing = await prisma.fitmentInquiry.findUnique({ where: { id } });
  if (!existing) {
    throw new FitmentInquiryNotFoundError(`Fitment inquiry "${id}" was not found`);
  }

  return prisma.fitmentInquiry.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
    },
  });
}
