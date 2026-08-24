// Activates one car brand's imported rows, and everything a customer needs for
// that brand's cars to work end to end.
//
//   pnpm tsx scripts/activate-imported.ts --car-brand "پژو" --dry-run
//   pnpm tsx scripts/activate-imported.ts --car-brand "پژو"
//   pnpm tsx scripts/activate-imported.ts --car-brand "پژو" --deactivate
//
// **This does not review anything.** It is the mechanical half of Task G.4 —
// flipping a coherent set of rows together — and it is deliberately scoped to
// one brand at a time so that somebody has to have looked at that brand first.
// Read docs/import-review-runbook.md before running it. A wrong oil
// recommendation damages an engine, and this script cannot tell a right one
// from a wrong one.
//
// **Why a whole chain rather than a checkbox.** A car is only visible when its
// brand, model and type are all active, and a recommended product is only
// purchasable when the product, its category AND its brand are active
// (server/order.ts). Activating any one of those alone produces a car finder
// that resolves to nothing, which looks exactly like a bug. So this walks the
// chain: car brand -> models -> types -> the products their fitment references
// -> those products' categories and brands.
//
// Products the source gave no price for are skipped and counted, never
// activated. That mirrors the guard in `updateProduct`, which refuses to put a
// product priced at zero in front of a customer who would read it as free.
//
// `--deactivate` reverses exactly what this activated, so a brand can be pulled
// back without hunting for the rows by hand.

import { prisma } from "../lib/db";

const SOURCE_PREFIX = "oil-city:";

interface Options {
  carBrand: string | null;
  all: boolean;
  dryRun: boolean;
  deactivate: boolean;
}

function parseArgs(argv: string[]): Options {
  let carBrand: string | null = null;
  let dryRun = false;
  let deactivate = false;
  let all = false;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--deactivate") deactivate = true;
    else if (argv[i] === "--all") all = true;
    else if (argv[i] === "--car-brand") {
      carBrand = argv[i + 1] ?? null;
      i += 1;
    } else {
      throw new Error(
        `Unknown argument "${argv[i]}".\n\n` +
          `Usage: activate-imported.ts --car-brand "<Persian name>" [--dry-run] [--deactivate]`,
      );
    }
  }

  if (!all && (carBrand === null || carBrand.trim() === "")) {
    throw new Error(`--car-brand is required, e.g. --car-brand "پژو" (or --all)`);
  }
  return { carBrand: all ? null : carBrand!.trim(), all, dryRun, deactivate };
}

class DryRunRollback extends Error {}

async function main() {
  const { carBrand, all, dryRun, deactivate } = parseArgs(process.argv.slice(2));
  const status = deactivate ? "INACTIVE" : "ACTIVE";

  // --all is for looking at the whole catalog yourself — a private preview,
  // where the point is to see what the import produced. It is NOT the reviewed
  // state docs/import-review-runbook.md describes, and a storefront serving real
  // customers should be built brand by brand after somebody has checked the
  // recommendations.
  // Selected by "has imported models", NOT by "carries an importer sourceRef".
  // Where a brand already existed by name the importer ADOPTS it — links its
  // imported models to the hand-entered row and leaves that row untouched — so
  // the adopted brands have no sourceRef of their own. Filtering on sourceRef
  // silently skipped exactly those: Peugeot and Hyundai, two of the most
  // important brands in the catalog.
  const brands = all
    ? await prisma.carBrand.findMany({
        where: { models: { some: { sourceRef: { startsWith: SOURCE_PREFIX } } } },
        select: { id: true, nameFa: true },
      })
    : await prisma.carBrand.findMany({
        where: { nameFa: carBrand as string },
        select: { id: true, nameFa: true },
      });

  if (brands.length === 0) {
    const known = await prisma.carBrand.findMany({ select: { nameFa: true }, take: 30 });
    throw new Error(
      `No car brand named "${carBrand}". Known brands include:\n  ${known.map((b) => b.nameFa).join(", ")}`,
    );
  }

  const models = await prisma.carModel.findMany({
    where: {
      carBrandId: { in: brands.map((b) => b.id) },
      sourceRef: { startsWith: SOURCE_PREFIX },
    },
    select: {
      id: true,
      engines: {
        select: {
          id: true,
          fitmentProfileLinks: {
            select: { profile: { select: { items: { select: { productId: true } } } } },
          },
        },
      },
    },
  });

  const engineIds = models.flatMap((m) => m.engines.map((e) => e.id));
  const productIds = [
    ...new Set(
      models.flatMap((m) =>
        m.engines.flatMap((e) =>
          e.fitmentProfileLinks.flatMap((l) =>
            l.profile.items.map((i) => i.productId).filter((id): id is string => id !== null),
          ),
        ),
      ),
    ),
  ];

  // Zero-priced products are the ones the source stated no price for. They are
  // counted rather than activated — see the note at the top of this file.
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, categoryId: true, brandId: true },
  });
  const priced = products.filter((p) => Number(p.price) > 0);
  const unpriced = products.length - priced.length;

  const categoryIds = [...new Set(priced.map((p) => p.categoryId))];
  const brandIds = [
    ...new Set(priced.map((p) => p.brandId).filter((id): id is string => id !== null)),
  ];

  console.log(
    `${deactivate ? "Deactivating" : "Activating"} ${all ? `all ${brands.length} imported car brands` : `"${brands[0].nameFa}"`}` +
      `${dryRun ? " — DRY RUN, nothing will be written" : ""}\n`,
  );
  console.log(`  car models      ${models.length}`);
  console.log(`  car types       ${engineIds.length}`);
  console.log(`  products        ${priced.length} (${unpriced} skipped — no price)`);
  console.log(`  categories      ${categoryIds.length}`);
  console.log(`  product brands  ${brandIds.length}`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.carBrand.updateMany({
        where: { id: { in: brands.map((b) => b.id) } },
        data: { status },
      });
      await tx.carModel.updateMany({
        where: { id: { in: models.map((m) => m.id) } },
        data: { status },
      });
      await tx.carEngine.updateMany({ where: { id: { in: engineIds } }, data: { status } });
      await tx.product.updateMany({
        where: { id: { in: priced.map((p) => p.id) } },
        data: { status },
      });
      // Categories and brands are shared with other cars, so deactivating a
      // brand must NOT drag them down with it — that would hide products
      // belonging to brands nobody asked to touch.
      if (!deactivate) {
        await tx.category.updateMany({ where: { id: { in: categoryIds } }, data: { status } });
        await tx.brand.updateMany({ where: { id: { in: brandIds } }, data: { status } });
      }
      if (dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  if (deactivate) {
    console.log(`\n  (categories and product brands left alone — they are shared with other cars)`);
  }
  console.log(dryRun ? "\nDRY RUN — the transaction above was rolled back." : "\nDone.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
