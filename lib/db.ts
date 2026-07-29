import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Reused across hot reloads in dev so `next dev` doesn't open a fresh
// connection pool on every file save and exhaust Postgres connections.
declare global {
  var prismaClient: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalThis.prismaClient ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
