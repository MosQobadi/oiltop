// Gives the products a customer actually sees a real photograph.
//
//   pnpm tsx scripts/images/product-images.ts --dry-run
//   pnpm tsx scripts/images/product-images.ts --limit 300
//   pnpm tsx scripts/images/product-images.ts --clear
//
// Replaces `scripts/demo-product-images.ts`, which put one stand-in bottle on
// all 2,315 active products so the card design could be judged against a real
// photograph. This puts the *right* photograph on each one.
//
// Ranked, not exhaustive — see `sources.ts` for why 300 is the number that
// matters. Rejecting, not just fetching — see `normalize.ts` for why an image
// that fails the white-ground standard is left off rather than let through.
//
// Safe to re-run. Output filenames are a hash of the image's own bytes, so the
// ~2.5 products that share one photograph share one file, a second run
// re-attaches the same paths, and `scrape/.cache/` means it does so without
// touching the network.

import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { prisma } from "../../lib/db";
import { closeBrowser, fetchBinary, HttpStatusError } from "../scrape/fetch";
import { NotACatalogImageError, normalizeProductImage } from "./normalize";
import { type ImageTarget, selectTargets } from "./sources";

/** Its own directory so `--clear` can find exactly what this script wrote, and no more. */
const OUTPUT_DIR = path.join("public", "uploads", "catalog");
const PUBLIC_PREFIX = "/uploads/catalog";

const DEFAULT_LIMIT = 300;

interface Options {
  limit: number;
  dryRun: boolean;
  clear: boolean;
}

function parseArgs(argv: string[]): Options {
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  let clear = false;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--clear") clear = true;
    else if (argv[i] === "--limit") {
      limit = Number(argv[i + 1]);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`--limit needs a positive integer, got "${argv[i + 1]}"`);
      }
      i += 1;
    } else {
      throw new Error(
        `Unknown argument "${argv[i]}".\n\nUsage: [--limit <n>] [--dry-run] | --clear`,
      );
    }
  }

  if (clear && (dryRun || limit !== DEFAULT_LIMIT)) {
    throw new Error("--clear takes no other arguments.");
  }
  return { limit, dryRun, clear };
}

async function clearCatalogImages(): Promise<void> {
  const { count } = await prisma.product.updateMany({
    where: { image: { startsWith: PUBLIC_PREFIX } },
    data: { image: null },
  });
  console.log(`Cleared ${count} catalog image${count === 1 ? "" : "s"}.`);
  console.log(
    `The files under ${OUTPUT_DIR}/ are left alone — delete them by hand if you mean to.`,
  );
}

/** Tallies, kept together so the summary cannot drift from what happened. */
class Outcome {
  attached = 0;
  alreadyCorrect = 0;
  sharedFile = 0;
  readonly rejected: { nameFa: string; url: string; reason: string }[] = [];
  readonly failed: { nameFa: string; url: string; reason: string }[] = [];
}

async function processTarget(
  target: ImageTarget,
  byUrl: Map<string, string | null>,
  outcome: Outcome,
): Promise<void> {
  // One photograph serves several products. The second product through does no
  // work at all, which is most of why a 300-product run is not 300 downloads.
  const seen = byUrl.get(target.imageUrl);
  if (seen !== undefined) {
    if (seen === null) return; // Already rejected or failed under another product.
    outcome.sharedFile += 1;
    await attach(target, seen, outcome);
    return;
  }

  let bytes: Buffer;
  try {
    bytes = await fetchBinary(target.imageUrl);
  } catch (error) {
    byUrl.set(target.imageUrl, null);
    const reason =
      error instanceof HttpStatusError
        ? `HTTP ${error.status}`
        : error instanceof Error
          ? error.message
          : String(error);
    outcome.failed.push({ nameFa: target.nameFa, url: target.imageUrl, reason });
    return;
  }

  let webp: Buffer;
  try {
    ({ webp } = await normalizeProductImage(bytes));
  } catch (error) {
    byUrl.set(target.imageUrl, null);
    if (error instanceof NotACatalogImageError) {
      outcome.rejected.push({ nameFa: target.nameFa, url: target.imageUrl, reason: error.message });
      return;
    }
    throw error;
  }

  // Named for the bytes it holds, so two source URLs that turn out to be the
  // same photograph collapse onto one file without a lookup table.
  const name = `${createHash("sha256").update(webp).digest("hex").slice(0, 16)}.webp`;
  await writeFile(path.join(OUTPUT_DIR, name), webp);

  const url = `${PUBLIC_PREFIX}/${name}`;
  byUrl.set(target.imageUrl, url);
  await attach(target, url, outcome);
}

async function attach(target: ImageTarget, url: string, outcome: Outcome): Promise<void> {
  const current = await prisma.product.findUnique({
    where: { id: target.productId },
    select: { image: true },
  });
  if (current?.image === url) {
    outcome.alreadyCorrect += 1;
    return;
  }
  await prisma.product.update({ where: { id: target.productId }, data: { image: url } });
  outcome.attached += 1;
}

function summarise(outcome: Outcome, targets: ImageTarget[]): void {
  const reasons = new Map<string, number>();
  for (const item of outcome.rejected) {
    const key = item.reason.replace(/\d+(\.\d+)?/g, "N");
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }

  console.log(`\nAttached      ${outcome.attached}`);
  console.log(`Already set   ${outcome.alreadyCorrect}`);
  console.log(`Shared a file ${outcome.sharedFile}`);
  console.log(`Rejected      ${outcome.rejected.length}`);
  console.log(`Failed        ${outcome.failed.length}`);
  console.log(`Of            ${targets.length} ranked products`);

  if (reasons.size > 0) {
    console.log("\nWhy images were rejected:");
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${reason}`);
    }
  }
  for (const item of outcome.failed.slice(0, 10)) {
    console.log(`  failed: ${item.reason} — ${item.url}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.clear) {
    await clearCatalogImages();
    return;
  }

  const { targets, skipped, distinctImages } = await selectTargets(options.limit);
  console.log(
    `${targets.length} products, in the order a car's results page shows their category.`,
  );
  console.log(`${distinctImages} distinct photographs behind them.`);
  console.log(`${skipped.length} ranked products had no source image and were passed over.`);

  if (options.dryRun) {
    // Per-category counts, not a list of names: the question a dry run is asked
    // is "does this budget cover the cards a car page actually shows", and only
    // the breakdown answers it.
    const perCategory = new Map<string, number>();
    for (const target of targets) {
      perCategory.set(target.categorySlug, (perCategory.get(target.categorySlug) ?? 0) + 1);
    }
    console.log("\nWhere the budget goes, in results-page order:");
    for (const [slug, count] of perCategory) {
      console.log(`  ${String(count).padStart(4)}  ${slug}`);
    }
    console.log("\n--dry-run: nothing downloaded, nothing written.");
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const outcome = new Outcome();
  const byUrl = new Map<string, string | null>();
  let done = 0;

  for (const target of targets) {
    await processTarget(target, byUrl, outcome);
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${targets.length}...`);
  }

  summarise(outcome, targets);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser();
    await prisma.$disconnect();
  });
