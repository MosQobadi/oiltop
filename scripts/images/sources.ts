// Which products get a photograph, and where that photograph comes from.
//
// The ordering is the whole idea. There are ~3,500 products and only ~1,400
// distinct photographs behind them, but even 1,400 is more than anyone is going
// to review by hand. What makes the job finite is that the catalog is not
// browsed evenly: almost every product a customer ever sees arrives through the
// car finder.
//
// Ranking on recommendation count alone looked obvious and was wrong. Measured
// on the real data it puts air fresheners and octane boosters first — ACCESSORY
// items carry 29,629 recommendations against ENGINE_OIL's 21,688 and FILTER's
// 3,160, because a generic add-on attaches to nearly every profile. Those sit
// behind "Show more" on the results page. Spending the budget there would
// photograph the extras and leave the maintenance the customer came for blank.
//
// So the primary key is the one the storefront already uses to decide what goes
// above the fold: `fitmentCategoryRank`. Oil, then filters, then everything
// else, exactly as the results page states them — and only within a category
// does recommendation count break the tie.
//
// The two bands behave very differently, which is worth knowing before setting
// a budget. Engine oil is 208 distinct products carrying 16,167 recommendations
// (~78 each), so photographing all of them fills the oil card on every car page
// in the catalog. Oil filters are 449 products carrying 1,034 (~2.3 each),
// because a filter is specific to the car. Oil is where a small budget buys the
// most, and filters are where full coverage is expensive.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/db";
import { sourceRefFor } from "../../lib/import";
import { fitmentCategoryRank } from "../../lib/storefront/fitment";

const SOURCE = "oil-city";
const SCRAPE_DIR = path.join("scrape", SOURCE);

/** A product that should get a photo, and the URL the photo comes from. */
export interface ImageTarget {
  productId: string;
  nameFa: string;
  sourceRef: string;
  imageUrl: string;
  /** How many fitment profile items recommend this product. Zero is possible. */
  recommendations: number;
  categorySlug: string;
}

export interface TargetReport {
  targets: ImageTarget[];
  /** Ranked products that had no usable source URL, with the reason. */
  skipped: { nameFa: string; reason: string }[];
  /** Distinct photographs behind `targets` — always <= targets.length. */
  distinctImages: number;
}

/**
 * WooCommerce serves this for a product with no photo of its own. It is a grey
 * "no image" card, so downloading it would put a picture of the absence of a
 * picture onto the shelf.
 */
function isPlaceholderUrl(url: string): boolean {
  return /woocommerce-placeholder|placeholder\.(png|jpe?g|webp)/i.test(url);
}

/**
 * Every scraped product's image URLs, keyed by the `sourceSlug` that the
 * importer turned into a `sourceRef`. Reading all 18 batch files costs about a
 * second and saves joining on Persian product names, which is the thing this
 * project has repeatedly learned not to do.
 */
export async function loadScrapedImageUrls(): Promise<Map<string, string[]>> {
  const files = (await readdir(SCRAPE_DIR))
    .filter((name) => name.startsWith("01-products") && name.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `No product batches found in ${SCRAPE_DIR}. Run the oil-city product scraper first.`,
    );
  }

  const bySlug = new Map<string, string[]>();
  for (const file of files) {
    const raw = await readFile(path.join(SCRAPE_DIR, file), "utf8");
    const batch = JSON.parse(raw) as { products?: { sourceSlug: string; imageUrls?: string[] }[] };
    for (const product of batch.products ?? []) {
      const urls = (product.imageUrls ?? []).filter((url) => !isPlaceholderUrl(url));
      if (urls.length > 0) bySlug.set(product.sourceSlug, urls);
    }
  }
  return bySlug;
}

/**
 * The top `limit` products, paired with a source URL, in the order the
 * storefront puts their categories on a car's results page.
 *
 * Products with no recommendations at all are included once the recommended
 * ones run out — a hand-entered product nothing points at yet still deserves a
 * photo if there is room in the run — but they sort last within their category,
 * so a small `limit` spends itself on the catalog that actually gets seen.
 */
export async function selectTargets(limit: number): Promise<TargetReport> {
  const bySlug = await loadScrapedImageUrls();

  const counts = await prisma.fitmentProfileItem.groupBy({
    by: ["productId"],
    _count: { _all: true },
  });
  const recommendationsByProduct = new Map<string, number>();
  for (const row of counts) {
    if (row.productId !== null) recommendationsByProduct.set(row.productId, row._count._all);
  }

  const products = await prisma.product.findMany({
    where: { NOT: { sourceRef: null } },
    select: {
      id: true,
      nameFa: true,
      sourceRef: true,
      status: true,
      category: { select: { slug: true, partType: true, sortOrder: true } },
    },
  });

  const ranked = products
    .map((product) => ({
      ...product,
      recommendations: recommendationsByProduct.get(product.id) ?? 0,
      rank: fitmentCategoryRank(product.category),
    }))
    .sort((a, b) => {
      // Where the category sits on a car's results page comes first — see the
      // note at the top of this file for why count alone got this backwards.
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (b.recommendations !== a.recommendations) return b.recommendations - a.recommendations;
      // Among products nothing recommends, an active one is the better bet:
      // it is the one that can actually appear on a listing page today.
      if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
      return a.nameFa.localeCompare(b.nameFa, "fa");
    });

  const targets: ImageTarget[] = [];
  const skipped: TargetReport["skipped"] = [];

  for (const product of ranked) {
    if (targets.length >= limit) break;
    // Non-null by the query's `where`, but the type does not know that.
    const sourceRef = product.sourceRef ?? "";
    const slug = sourceRef.startsWith(sourceRefFor(SOURCE, "product", ""))
      ? sourceRef.slice(sourceRefFor(SOURCE, "product", "").length)
      : null;

    if (slug === null) {
      skipped.push({ nameFa: product.nameFa, reason: `sourceRef is not ${SOURCE}: ${sourceRef}` });
      continue;
    }
    const urls = bySlug.get(slug);
    if (urls === undefined) {
      skipped.push({ nameFa: product.nameFa, reason: "no image in the scrape data" });
      continue;
    }

    targets.push({
      productId: product.id,
      nameFa: product.nameFa,
      sourceRef,
      imageUrl: urls[0],
      recommendations: product.recommendations,
      categorySlug: product.category.slug,
    });
  }

  return {
    targets,
    skipped,
    distinctImages: new Set(targets.map((target) => target.imageUrl)).size,
  };
}
