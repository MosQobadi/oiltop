import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Reused across hot reloads in dev so `next dev` doesn't open a fresh
// connection pool on every file save and exhaust Postgres connections.
declare global {
  var prismaClient: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// sourceRef is importer plumbing (see the comment on Product in schema.prisma).
// Most list/detail queries use `include` rather than an explicit `select`, so
// without this the column would ride along into every admin API response.
// Omitting it globally keeps that from happening by default; the importer opts
// back in per query with `omit: { sourceRef: false }`.
const omitSourceRef = { sourceRef: true } as const;

// Product.finalPrice is the generated column the PLP's price sort orders by
// (see schema.prisma) — not a value any response carries. What callers read is
// still computed at read time from price/discountPercent, so omitting the
// column here keeps a stray Decimal spelling of the same number out of the
// `include`-based admin responses. `orderBy` is unaffected by `omit`.
const omitProductColumns = { ...omitSourceRef, finalPrice: true } as const;

export const prisma =
  globalThis.prismaClient ??
  new PrismaClient({
    adapter,
    omit: {
      product: omitProductColumns,
      brand: omitSourceRef,
      carBrand: omitSourceRef,
      carModel: omitSourceRef,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
