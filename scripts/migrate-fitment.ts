import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// One-time migration from the original per-engine FitmentRecommendation model to
// the reusable FitmentProfile/FitmentProfileItem model (see Design Decision 9 in
// topoil-admin-claude-code-tasks.md and Task 8.6). Creates a 1:1 profile per
// engine to start — it does not try to detect which engines should already
// share a profile; that's a judgment call to make afterward in the Fitment
// Profiles UI (Task 8.4). Safe to re-run: engines that already have a
// CarEngineFitmentProfile link are skipped. Does not delete the source
// FitmentRecommendation rows or table — drop those in a follow-up migration
// once the Fitment Preview tool has been spot-checked against the new data.
async function main() {
  const carEngines = await prisma.carEngine.findMany({
    where: { fitmentRecommendations: { some: {} } },
    include: {
      carModel: { include: { carBrand: true } },
      fitmentRecommendations: true,
      fitmentProfileLinks: true,
    },
  });

  let migrated = 0;
  let skipped = 0;

  for (const carEngine of carEngines) {
    if (carEngine.fitmentProfileLinks.length > 0) {
      skipped += 1;
      continue;
    }

    const label = `${carEngine.carModel.carBrand.nameEn} ${carEngine.carModel.nameEn} ${carEngine.labelEn} (migrated)`;

    await prisma.$transaction(async (tx) => {
      const profile = await tx.fitmentProfile.create({
        data: { label },
      });

      for (const rec of carEngine.fitmentRecommendations) {
        await tx.fitmentProfileItem.create({
          data: {
            profileId: profile.id,
            categoryId: rec.categoryId,
            climate: rec.climate,
            productId: rec.productId,
            specNote: rec.specNote,
            specAttributes: rec.specAttributes === null
              ? Prisma.DbNull
              : (rec.specAttributes as Prisma.InputJsonValue),
            priority: rec.priority,
            adminNote: rec.adminNote,
          },
        });
      }

      await tx.carEngineFitmentProfile.create({
        data: { carEngineId: carEngine.id, profileId: profile.id },
      });
    });

    migrated += 1;
  }

  console.log(
    `Migrated ${migrated} car engine(s) to a new FitmentProfile; skipped ${skipped} already-linked engine(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
