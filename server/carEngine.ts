import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import type {
  CarEngineCreateInput,
  CarEngineListQuery,
  CarEngineSearchableQuery,
  CarEngineUpdateInput,
} from "@/lib/validation";
import { isYearInCalendar, yearRangeMessage } from "@/lib/year";

export class CarEngineNotFoundError extends Error {}
export class CarEngineHasFitmentProfileLinksError extends Error {}
export class CarEngineYearCalendarError extends Error {}

// A year is only meaningful next to the calendar it was written in, and that
// calendar lives on the engine's model. Checking it here rather than in the Zod
// schema is deliberate: the schema sees one request in isolation, while the
// answer depends on a row in the database — and reading the calendar from the
// client would let a caller declare 1390 Gregorian and store a 14th-century car.
async function assertYearsMatchModelCalendar(
  carModelId: string,
  years: { yearStart?: number; yearEnd?: number | null },
) {
  const model = await prisma.carModel.findUnique({
    where: { id: carModelId },
    select: { yearCalendar: true },
  });
  if (!model) {
    throw new CarEngineNotFoundError(`Car model "${carModelId}" was not found`);
  }

  for (const year of [years.yearStart, years.yearEnd]) {
    if (year === undefined || year === null) continue;
    if (!isYearInCalendar(year, model.yearCalendar)) {
      throw new CarEngineYearCalendarError(yearRangeMessage(model.yearCalendar));
    }
  }
}

export async function listCarEngines(query: CarEngineListQuery) {
  const where: Prisma.CarEngineWhereInput = {
    carModelId: query.carModelId,
    ...(query.status ? { status: query.status } : {}),
    // Tokenised — see `lib/search.ts`.
    AND: searchTokens(query.search).map((token) => ({
      OR: [{ labelEn: contains(token) }, { labelFa: contains(token) }],
    })),
  };

  const [carEngines, total] = await Promise.all([
    prisma.carEngine.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.carEngine.count({ where }),
  ]);

  return { carEngines, total };
}

export async function getCarEngineById(id: string) {
  const carEngine = await prisma.carEngine.findUnique({
    where: { id },
    include: {
      fitmentProfileLinks: {
        include: {
          profile: { include: { _count: { select: { items: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!carEngine) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }

  const { fitmentProfileLinks, ...rest } = carEngine;
  return {
    ...rest,
    fitmentProfileLinks: fitmentProfileLinks.map((link) => ({
      id: link.id,
      profile: {
        id: link.profile.id,
        label: link.profile.label,
        itemCount: link.profile._count.items,
      },
    })),
  };
}

export async function createCarEngine(input: CarEngineCreateInput) {
  await assertYearsMatchModelCalendar(input.carModelId, input);
  return prisma.carEngine.create({ data: input });
}

export async function updateCarEngine(id: string, input: CarEngineUpdateInput) {
  const existing = await prisma.carEngine.findUnique({ where: { id } });
  if (!existing) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }

  // A PATCH may move the engine to another model, change the years, or both, so
  // the check runs the years it will END UP with against the model it will end
  // up on. Moving a 1390 car to a Gregorian model without touching its years is
  // just as wrong as typing 1390 into one, and omitting a key means "leave it",
  // not "it's fine".
  await assertYearsMatchModelCalendar(input.carModelId ?? existing.carModelId, {
    yearStart: input.yearStart ?? existing.yearStart,
    yearEnd: input.yearEnd === undefined ? existing.yearEnd : input.yearEnd,
  });

  return prisma.carEngine.update({ where: { id }, data: input });
}

export async function deleteCarEngine(id: string) {
  const existing = await prisma.carEngine.findUnique({
    where: { id },
    include: { _count: { select: { fitmentProfileLinks: true } } },
  });
  if (!existing) {
    throw new CarEngineNotFoundError(`Car engine "${id}" was not found`);
  }
  if (existing._count.fitmentProfileLinks > 0) {
    throw new CarEngineHasFitmentProfileLinksError(
      `Cannot delete car engine with ${existing._count.fitmentProfileLinks} fitment profile(s) attached — detach them first`,
    );
  }

  await prisma.carEngine.delete({ where: { id } });
}

// Backs the Fitment Profile "Attach Engines" picker: {id, label} pairs
// (label = "Brand Model Engine (yearStart–yearEnd)") filterable by brand,
// model, and year range so an admin can narrow before bulk-attaching.
export async function listSearchableCarEngines(query: CarEngineSearchableQuery) {
  const where: Prisma.CarEngineWhereInput = {
    status: "ACTIVE",
    carModelId: query.carModelId,
    carModel: query.carBrandId ? { carBrandId: query.carBrandId } : undefined,
    AND: [
      ...(query.yearFrom !== undefined
        ? [{ OR: [{ yearEnd: null }, { yearEnd: { gte: query.yearFrom } }] }]
        : []),
      ...(query.yearTo !== undefined ? [{ yearStart: { lte: query.yearTo } }] : []),
      // Tokenised so "Peugeot 206" spans carBrand.nameEn + carModel.nameEn —
      // the picker's label is built from both, so neither column ever contains
      // the whole phrase. See `lib/search.ts`.
      ...searchTokens(query.search).map((token) => ({
        OR: [
          { labelEn: contains(token) },
          { labelFa: contains(token) },
          { carModel: { nameEn: contains(token) } },
          { carModel: { carBrand: { nameEn: contains(token) } } },
        ],
      })),
    ],
  };

  const [carEngines, total] = await Promise.all([
    prisma.carEngine.findMany({
      where,
      include: { carModel: { include: { carBrand: true } } },
      orderBy: [
        { carModel: { carBrand: { nameEn: "asc" } } },
        { carModel: { nameEn: "asc" } },
        { labelEn: "asc" },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.carEngine.count({ where }),
  ]);

  return {
    carEngines: carEngines.map((engine) => ({
      id: engine.id,
      label: `${engine.carModel.carBrand.nameEn} ${engine.carModel.nameEn} ${engine.labelEn} (${engine.yearStart}–${engine.yearEnd ?? "Present"})`,
    })),
    total,
  };
}
