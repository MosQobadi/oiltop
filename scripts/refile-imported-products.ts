// Empties the oil-city import's holding shelf into real categories.
//
//   pnpm tsx scripts/refile-imported-products.ts --dry-run
//   pnpm tsx scripts/refile-imported-products.ts
//
// **What it fixes.** DECISION 2 of oil-city-import-notes.md parked every
// product whose source category we had no match for — 1,749 of 3,469 — on one
// INACTIVE-by-design holding shelf, and every fitment item pointing at one
// followed it there. The result a customer saw was a car resolving to 126 cards
// under two headings, most of it "Uncategorised (imported)": brake pads, octane
// boosters, gearbox oil and window washer fluid in one undifferentiated pile.
//
// Two separate wrongs, fixed in the two passes below:
//
//   1. **Products** with no category of their own. `lib/import.ts`'s
//      SOURCE_CATEGORY_REFILE maps oil-city's own taxonomy label onto ours, and
//      REFILE_CATEGORIES holds the categories to file them into.
//   2. **Fitment items** whose product IS properly categorised but whose item
//      still sits on the shelf. oil-city puts every filter type in one accordion
//      section (`فیلترها`), so the section could not carry a `categoryGuess`
//      and the importer fell back to the shelf — leaving 2,790 items whose
//      linked product is a known oil/air/cabin/fuel filter filed as unknown.
//      An item's category follows its product's; that is pass 2, and it needs no
//      scrape data at all.
//
// **Why this is not part of `scripts/import.ts`.** A fitment item's category
// slug is an input to `fitmentHash`, which is the idempotency key for all 802
// imported profiles (`FitmentProfile.internalNote`). Recategorising during
// import would change every hash and mint a duplicate profile for every car on
// the next run. Refiling afterwards leaves the hashes alone — and, because this
// script only ever moves rows OFF the shelf, a later import that files a new
// product back onto it is fixed by running this again rather than by fighting
// it.
//
// **Idempotent.** A product already off the shelf is left exactly where it is,
// so a category corrected by hand in the admin panel survives every re-run.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";
import {
  REFILE_CATEGORIES,
  refileCategorySlug,
  UNCATEGORISED_CATEGORY,
  type RefileCategory,
} from "../lib/import";

const SCRAPE_DIR = path.join("scrape", "oil-city");
const PRODUCT_BATCH_PREFIX = "01-products-";
const SOURCE_PREFIX = "oil-city:product/";

function parseArgs(argv: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else
      throw new Error(`Unknown argument "${arg}". Usage: refile-imported-products.ts [--dry-run]`);
  }
  return { dryRun };
}

/** Thrown to roll a dry run's transaction back — the trick scripts/import.ts uses. */
class DryRunRollback extends Error {}

// --- The source's own answer -----------------------------------------------

// `Product.sourceRef` is "oil-city:product/<decoded last URL segment>" (see
// `sourceRefFor`), so the batch files can be indexed by the same key the
// database stores rather than by matching names.
function sourceRefFor(sourceUrl: string): string | null {
  try {
    const segment = new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1);
    return segment === undefined ? null : SOURCE_PREFIX + decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** sourceRef -> the taxonomy label oil-city's breadcrumb printed for it. */
async function readSourceCategories(): Promise<Map<string, string>> {
  const files = (await readdir(SCRAPE_DIR)).filter((name) => name.startsWith(PRODUCT_BATCH_PREFIX));
  files.sort();

  const byRef = new Map<string, string>();
  for (const file of files) {
    const batch: unknown = JSON.parse(await readFile(path.join(SCRAPE_DIR, file), "utf8"));
    const products = (batch as { products?: unknown }).products;
    if (!Array.isArray(products)) continue;

    for (const entry of products) {
      const product = entry as { sourceUrl?: unknown; sourceCategoryText?: unknown };
      if (typeof product.sourceUrl !== "string") continue;
      if (typeof product.sourceCategoryText !== "string") continue;

      const ref = sourceRefFor(product.sourceUrl);
      if (ref !== null) byRef.set(ref, product.sourceCategoryText);
    }
  }
  return byRef;
}

// --- Pass 0: the categories themselves --------------------------------------

// Created ACTIVE, deliberately. The holding shelf is active on this database
// (scripts/activate-imported.ts walks a brand's whole chain, categories
// included), and a product is only publicly visible while its category is —
// so filing a currently-visible product into an INACTIVE category would delete
// recommendations from the storefront rather than tidy them.
//
// Only `sortOrder` is written on a category that already exists: the six
// primary slugs are being renumbered into the order the results page reads
// them, and nothing else here is allowed to overwrite an admin's editing.
async function ensureCategories(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  log: string[],
): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();

  for (const category of REFILE_CATEGORIES) {
    const existing = await tx.category.findUnique({
      where: { slug: category.slug },
      select: { id: true, sortOrder: true },
    });

    if (existing === null) {
      const created = await tx.category.create({
        data: categoryCreateData(category),
        select: { id: true },
      });
      idBySlug.set(category.slug, created.id);
      log.push(`created category ${category.slug} (${category.nameEn})`);
      continue;
    }

    idBySlug.set(category.slug, existing.id);
    if (existing.sortOrder !== category.sortOrder) {
      await tx.category.update({
        where: { id: existing.id },
        data: { sortOrder: category.sortOrder },
      });
      log.push(
        `renumbered ${category.slug}: sortOrder ${existing.sortOrder} -> ${category.sortOrder}`,
      );
    }
  }

  return idBySlug;
}

function categoryCreateData(category: RefileCategory) {
  return {
    slug: category.slug,
    nameEn: category.nameEn,
    nameFa: category.nameFa,
    shortDescriptionEn: category.shortDescriptionEn,
    shortDescriptionFa: category.shortDescriptionFa,
    // Left empty rather than filled with filler: the category landing pages
    // read this as body copy, and an invented paragraph is worse than none.
    longDescriptionEn: "",
    longDescriptionFa: "",
    tags: [],
    partType: category.partType,
    status: "ACTIVE" as const,
    sortOrder: category.sortOrder,
  };
}

// --- Passes 1 and 2 ---------------------------------------------------------

interface Counts {
  productsRefiled: Map<string, number>;
  productsLeft: Map<string, number>;
  itemsRefiled: number;
  itemsLeft: number;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const sourceCategories = await readSourceCategories();
  console.log(`Indexed ${sourceCategories.size} scraped products by sourceRef.`);

  const log: string[] = [];
  const counts: Counts = {
    productsRefiled: new Map(),
    productsLeft: new Map(),
    itemsRefiled: 0,
    itemsLeft: 0,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        const idBySlug = await ensureCategories(tx, log);

        const shelf = await tx.category.findUnique({
          where: { slug: UNCATEGORISED_CATEGORY.slug },
          select: { id: true },
        });
        if (shelf === null) {
          console.log("No holding shelf on this database — nothing imported to refile.");
          if (dryRun) throw new DryRunRollback();
          return;
        }

        // Pass 1 — products the source's taxonomy can place.
        const stranded = await tx.product.findMany({
          where: { categoryId: shelf.id, sourceRef: { startsWith: SOURCE_PREFIX } },
          select: { id: true, sourceRef: true },
        });

        for (const product of stranded) {
          const label = product.sourceRef === null ? null : sourceCategories.get(product.sourceRef);
          const slug = refileCategorySlug(label ?? null);
          if (slug === null) {
            bump(counts.productsLeft, label ?? "(not in the scrape files)");
            continue;
          }

          const categoryId = idBySlug.get(slug);
          if (categoryId === undefined)
            throw new Error(`refile target "${slug}" was never created`);

          await tx.product.update({ where: { id: product.id }, data: { categoryId } });
          bump(counts.productsRefiled, slug);
        }

        // Pass 2 — items follow their product, including the ones pass 1 just
        // moved. Run as one statement rather than per row: this is 55k items on
        // a full import, and every one of them is the same assignment.
        const moved = await tx.$executeRaw`
          UPDATE "FitmentProfileItem" AS item
          SET "categoryId" = product."categoryId", "updatedAt" = NOW()
          FROM "Product" AS product
          WHERE item."productId" = product.id
            AND item."categoryId" = ${shelf.id}
            AND product."categoryId" <> ${shelf.id}
        `;
        counts.itemsRefiled = moved;
        counts.itemsLeft = await tx.fitmentProfileItem.count({ where: { categoryId: shelf.id } });

        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 600_000 },
    );
  } catch (error) {
    if (error instanceof DryRunRollback) {
      report(log, counts);
      console.log("\nDRY RUN — rolled back, nothing was written.");
      return;
    }
    throw error;
  }

  report(log, counts);
  console.log("\nCommitted.");
}

function bump(tally: Map<string, number>, key: string) {
  tally.set(key, (tally.get(key) ?? 0) + 1);
}

function report(log: string[], counts: Counts) {
  if (log.length > 0) {
    console.log(`\nCategories (${log.length}):`);
    for (const line of log) console.log(`  ${line}`);
  }

  console.log(`\nProducts refiled (${total(counts.productsRefiled)}):`);
  for (const [slug, count] of sorted(counts.productsRefiled)) {
    console.log(`  ${String(count).padStart(5)}  ${slug}`);
  }

  console.log(`\nProducts left on the shelf (${total(counts.productsLeft)}):`);
  for (const [label, count] of sorted(counts.productsLeft)) {
    console.log(`  ${String(count).padStart(5)}  ${label}`);
  }

  console.log(`\nFitment items refiled: ${counts.itemsRefiled}`);
  console.log(`Fitment items left on the shelf: ${counts.itemsLeft}`);
}

function total(tally: Map<string, number>): number {
  let sum = 0;
  for (const count of tally.values()) sum += count;
  return sum;
}

function sorted(tally: Map<string, number>): [string, number][] {
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
