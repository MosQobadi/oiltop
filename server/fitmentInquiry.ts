import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  FitmentInquiryListQuery,
  FitmentInquiryPatchInput,
} from "@/lib/validation";

export class FitmentInquiryNotFoundError extends Error {}

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
