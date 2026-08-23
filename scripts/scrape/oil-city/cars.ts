// oil-city.ir's car pages — brand, model and the parts recommended for it —
// into D.1 batch files.
//
//   pnpm tsx scripts/scrape/oil-city/cars.ts
//   pnpm tsx scripts/scrape/oil-city/cars.ts --limit 5
//
// Writes `scrape/oil-city/50-cars-NNN.json`. The `50-` prefix sorts these AFTER
// the `01-products-*` batches, and that ordering is load-bearing: scripts/import.ts
// reads a source directory in filename order and each file is its own
// transaction, so a car whose products have not been imported yet resolves its
// sections spec-only. Scrape and import products first.
//
// Enumeration is from cars-sitemap.xml. A /car/ URL with two path segments is a
// brand and is skipped; three segments is a model page, which is what carries
// the recommendations — there is no separate fitment URL.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseScrapeBatch, type ScrapeCar, type ScrapeProblem } from "@/lib/validation/import";
import { closeBrowser, fetchPage, HttpStatusError, RobotsDisallowedError } from "../fetch";
import { parseCarPage } from "./car-page";

const SITEMAP = "https://www.oil-city.ir/cars-sitemap.xml";
const OUT_DIR = path.join("scrape", "oil-city");
const BATCH_SIZE = 50;

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
      throw new Error(`Unknown argument "${argv[i]}". Usage: cars.ts [--limit <n>]`);
    }
  }

  return { limit };
}

/**
 * Model-page URLs from the car sitemap, in sitemap order.
 *
 * One path segment after /car/ is a brand index and holds no recommendations;
 * two is a model. The site has ~81 of the former and ~803 of the latter.
 */
export function carModelUrlsFrom(xml: string): string[] {
  const urls = [...xml.matchAll(/https?:\/\/[^\s<"]+/g)].map((match) => match[0]);

  return [...new Set(urls)].filter((url) => {
    try {
      const segments = new URL(url).pathname.split("/").filter((segment) => segment !== "");
      return segments[0] === "car" && segments.length === 3;
    } catch {
      return false;
    }
  });
}

function batchFileName(index: number): string {
  return `50-cars-${String(index).padStart(3, "0")}.json`;
}

async function writeBatch(
  index: number,
  cars: ScrapeCar[],
  problems: ScrapeProblem[],
  sourceUrls: string[],
): Promise<string> {
  const fitmentRows = cars.reduce(
    (total, car) =>
      total + car.sections.reduce((rows, section) => rows + section.products.length, 0),
    0,
  );

  const batch = {
    _meta: {
      batchLabel: `oil-city / cars batch ${index}`,
      sourceUrls,
      extractedAt: new Date().toISOString(),
      counts: { products: 0, carModels: cars.length, fitmentRows },
    },
    products: [],
    cars,
    problems,
  };

  // Validated before writing, so a batch that cannot be imported is caught while
  // the run that produced it is still on screen.
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

  const xml = await fetchPage(SITEMAP, { asText: true });
  const allModels = carModelUrlsFrom(xml);
  const targets = limit === null ? allModels : allModels.slice(0, limit);
  console.log(
    `${allModels.length} car model URLs${limit === null ? "" : `, taking the first ${targets.length}`}\n`,
  );

  let batchIndex = 1;
  let cars: ScrapeCar[] = [];
  let problems: ScrapeProblem[] = [];
  let batchUrls: string[] = [];
  let written = 0;
  let failed = 0;
  let fitmentRows = 0;
  // What the source recommends that we have no category for. The tally is the
  // point: DECISION 2 in oil-city-import-notes.md is a product decision waiting
  // on these counts.
  const sectionTally = new Map<string, number>();

  const flush = async () => {
    if (cars.length === 0 && problems.length === 0) return;
    const filePath = await writeBatch(batchIndex, cars, problems, batchUrls);
    console.log(`  wrote ${filePath} (${cars.length} cars, ${problems.length} problems)`);
    batchIndex += 1;
    cars = [];
    problems = [];
    batchUrls = [];
  };

  for (const [index, url] of targets.entries()) {
    try {
      const parsed = parseCarPage(await fetchPage(url), url);
      for (const issue of parsed.problems) problems.push({ sourceUrl: url, issue });

      if (parsed.car === null) {
        failed += 1;
      } else {
        cars.push(parsed.car);
        written += 1;
        for (const section of parsed.car.sections) {
          fitmentRows += section.products.length;
          if (section.categoryGuess === null && section.headingFa !== null) {
            // Tally the section's own name, not the whole heading — the heading
            // ends in the car it belongs to, which would make every one unique.
            const name = section.headingFa
              .replace(/\sبرای\s+.+$/u, "")
              .replace(/\s*\(.*$/u, "")
              .trim();
            sectionTally.set(name, (sectionTally.get(name) ?? 0) + 1);
          }
        }
      }
      batchUrls.push(url);
    } catch (error) {
      failed += 1;
      // Every URL on this host would be refused the same way, so there is
      // nothing to be gained by working through the remaining 800.
      if (error instanceof RobotsDisallowedError) throw error;

      const issue =
        error instanceof HttpStatusError
          ? `HTTP ${error.status}`
          : `fetch failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
      problems.push({ sourceUrl: url, issue });
      batchUrls.push(url);
      console.log(`  ! ${decodeURIComponent(url)} — ${issue}`);
    }

    if (cars.length >= BATCH_SIZE) await flush();
    if ((index + 1) % 25 === 0) console.log(`  ...${index + 1}/${targets.length}`);
  }

  await flush();

  console.log(`\nDone. ${written} cars, ${fitmentRows} fitment rows, ${failed} failures.`);

  if (sectionTally.size > 0) {
    console.log(`\nSections with no category of ours, by the source's own heading:`);
    for (const [name, count] of [...sectionTally].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(5)}  ${name}`);
    }
    console.log(
      `\nNothing here is dropped — every section is recorded with its heading verbatim.\n` +
        `Whether any of them becomes a real category is a human decision (DECISION 2).`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
