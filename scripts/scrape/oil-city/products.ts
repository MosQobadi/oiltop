// oil-city.ir's product catalog, into D.1 batch files.
//
//   pnpm tsx scripts/scrape/oil-city/products.ts
//   pnpm tsx scripts/scrape/oil-city/products.ts --limit 20
//
// Writes `scrape/oil-city/01-products-NNN.json`. The `01-` prefix is
// load-bearing: scripts/import.ts reads a source directory in filename order
// and each file is its own transaction, so a car page whose products live in a
// later file imports its fitment spec-only. Products must sort before cars.
//
// Enumeration is from the Yoast sitemaps, never by crawling links — and it has
// to be, because oil-city's robots.txt disallows `/*?`, every URL carrying a
// query string. That rules out their search and any `?orderby=` listing. See
// scripts/scrape/fetch.ts.
//
// The rules from section 4 of oil-city-import-notes.md apply to every field
// this writes: never invent a value, never translate, never derive one field
// from another, and put anything unexpected in `problems` rather than
// improvising. A batch that reports a gap is useful; one that fills the gap in
// with a guess is worse than nothing.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseScrapeBatch, type ScrapeProblem, type ScrapeProduct } from "@/lib/validation/import";
import { closeBrowser, fetchPage, HttpStatusError, RobotsDisallowedError } from "../fetch";
import { parseProductPage } from "./product-page";

const SITEMAPS = [
  "https://www.oil-city.ir/products-sitemap.xml",
  "https://www.oil-city.ir/products-sitemap2.xml",
  "https://www.oil-city.ir/products-sitemap3.xml",
  "https://www.oil-city.ir/products-sitemap4.xml",
];

const OUT_DIR = path.join("scrape", "oil-city");
const BATCH_SIZE = 200;

interface Options {
  limit: number | null;
}

function parseArgs(argv: string[]): Options {
  let limit: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit needs a positive whole number");
      }
      limit = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument "${argv[i]}". Usage: products.ts [--limit <n>]`);
    }
  }

  return { limit };
}

/**
 * Product URLs from a sitemap, in sitemap order.
 *
 * Deliberately a regex over `<loc>` rather than an XML parser: the document is
 * a flat list of URLs, and the browser hands it back as text after the CDN's
 * shim has run, not as a parseable XML document.
 */
export function productUrlsFrom(xml: string): string[] {
  return [...xml.matchAll(/https?:\/\/[^\s<"]+/g)]
    .map((match) => match[0])
    .filter((url) => url.includes("/product/"));
}

function batchFileName(index: number): string {
  return `01-products-${String(index).padStart(3, "0")}.json`;
}

async function writeBatch(
  index: number,
  products: ScrapeProduct[],
  problems: ScrapeProblem[],
  sourceUrls: string[],
): Promise<string> {
  const batch = {
    _meta: {
      batchLabel: `oil-city / products batch ${index}`,
      sourceUrls,
      extractedAt: new Date().toISOString(),
      counts: { products: products.length, carModels: 0, fitmentRows: 0 },
    },
    products,
    cars: [],
    problems,
  };

  // Validated before it is written, not after. A batch that cannot be imported
  // is worth discovering now, while the run that produced it is still on
  // screen, rather than hours later in front of the importer.
  const fileName = batchFileName(index);
  const parsed = parseScrapeBatch(fileName, batch);
  if (!parsed.success) {
    throw new Error(
      `Refusing to write an invalid batch:\n  ${parsed.errors.slice(0, 20).join("\n  ")}`,
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  const filePath = path.join(OUT_DIR, fileName);
  await writeFile(filePath, JSON.stringify(batch, null, 2), "utf8");
  return filePath;
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));

  const urls: string[] = [];
  for (const sitemap of SITEMAPS) {
    const xml = await fetchPage(sitemap, { asText: true });
    const found = productUrlsFrom(xml);
    console.log(`${sitemap} -> ${found.length} product URLs`);
    urls.push(...found);
  }

  // One product can appear in more than one sitemap; the importer would
  // deduplicate on sourceRef anyway, but fetching it twice is just rudeness.
  const unique = [...new Set(urls)];
  const targets = limit === null ? unique : unique.slice(0, limit);
  console.log(
    `\n${unique.length} unique product URLs${limit === null ? "" : `, taking the first ${targets.length}`}\n`,
  );

  let batchIndex = 1;
  let products: ScrapeProduct[] = [];
  let problems: ScrapeProblem[] = [];
  let batchUrls: string[] = [];
  let written = 0;
  let failed = 0;
  // The tally DECISION 2 in oil-city-import-notes.md deferred: what the source
  // calls the things we have no category for. Only actionable once counted.
  const categoryTally = new Map<string, number>();

  const flush = async () => {
    if (products.length === 0 && problems.length === 0) return;
    const filePath = await writeBatch(batchIndex, products, problems, batchUrls);
    console.log(`  wrote ${filePath} (${products.length} products, ${problems.length} problems)`);
    batchIndex += 1;
    products = [];
    problems = [];
    batchUrls = [];
  };

  for (const [index, url] of targets.entries()) {
    try {
      const html = await fetchPage(url);
      const parsed = parseProductPage(html, url);

      for (const issue of parsed.problems) problems.push({ sourceUrl: url, issue });

      if (parsed.product === null) {
        failed += 1;
      } else {
        products.push(parsed.product);
        written += 1;
        const label = parsed.product.categoryGuess ?? parsed.product.sourceCategoryText;
        if (parsed.product.categoryGuess === null && label !== null) {
          categoryTally.set(label, (categoryTally.get(label) ?? 0) + 1);
        }
      }
      batchUrls.push(url);
    } catch (error) {
      failed += 1;
      // A refusal is not a page problem, and retrying the rest of the host after
      // one is pointless — every URL on it will be refused the same way.
      if (error instanceof RobotsDisallowedError) throw error;

      const issue =
        error instanceof HttpStatusError
          ? `HTTP ${error.status}`
          : `fetch failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
      problems.push({ sourceUrl: url, issue });
      batchUrls.push(url);
      console.log(`  ! ${decodeURIComponent(url)} — ${issue}`);
    }

    if (products.length + problems.length >= BATCH_SIZE) await flush();
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${targets.length}`);
    }
  }

  await flush();

  console.log(`\nDone. ${written} products, ${failed} failures.`);

  if (categoryTally.size > 0) {
    console.log(`\nProducts outside our five categories, by the source's own wording:`);
    for (const [label, count] of [...categoryTally].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(5)}  ${label}`);
    }
    console.log(
      `\nThese import into the holding category (imported-uncategorised, INACTIVE).\n` +
        `Creating real categories for any of them is a human decision — see DECISION 2\n` +
        `in oil-city-import-notes.md.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
