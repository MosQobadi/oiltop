// hamrah-mechanic.com's car models and the Jalali year spans they state, for
// the enrichment pass. oil-city names a year for only ~38% of its cars; this is
// where the rest come from.
//
//   pnpm tsx scripts/scrape/hamrah-mechanic/models.ts
//   pnpm tsx scripts/scrape/hamrah-mechanic/models.ts --maker irankhodro
//
// Writes ONE file, `scrape/hamrah-mechanic/models.json`, in the enrichment shape
// (lib/validation/enrichment.ts) — not D.1's batch format, and never fed to
// scripts/import.ts. See scripts/enrich-years.ts for why applying years is a
// separate job from importing.
//
// **The span comes from the model index page's own title**, which every one of
// them carries: "قیمت سمند LX صفر و کارکرده 1382-1401 امروز – همراه مکانیک".
// That is one span per model, which is the granularity we want. The per-type
// pages underneath (`/type-161`) carry their own narrower spans, and reading
// those would be inviting exactly the join problem this scrape is built to
// avoid — our imported cars have no types to match them to.
//
// **The name includes the maker** — "پژو 405 SLX" — and that is load-bearing.
// It lets the enrichment match against `carBrand.nameFa + " " + carModel.nameFa`
// directly, with no mapping between hamrah's maker slugs and oil-city's brand
// names. It also sidesteps a trap: hamrah files Peugeots under `irankhodro`,
// so a slug-to-slug brand mapping would have been wrong from the start.
//
// robots.txt allows every /carprice/ path this touches; it was checked before
// the first request and is checked again on every run by the fetcher.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { parseEnrichmentFile, type EnrichmentModel } from "@/lib/validation/enrichment";
import { toLatinDigits } from "@/lib/import";
import { calendarForYear } from "@/lib/year";
import { closeBrowser, fetchPage } from "../fetch";

const ORIGIN = "https://www.hamrah-mechanic.com";
const INDEX = `${ORIGIN}/carprice/`;
const OUT_DIR = path.join("scrape", "hamrah-mechanic");
const OUT_FILE = "models.json";

function parseArgs(argv: string[]): { maker: string | null } {
  let maker: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--maker") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--maker needs a slug, e.g. --maker irankhodro");
      }
      maker = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument "${argv[i]}". Usage: models.ts [--maker <slug>]`);
    }
  }
  return { maker };
}

const absolute = (href: string) => new URL(href, ORIGIN).toString();

/** `/carprice/<maker>/` links from the price index. */
export function makerSlugsFrom(html: string): string[] {
  const $ = cheerio.load(html);
  const slugs = $("a[href*='/carprice/']")
    .map((_, a) => $(a).attr("href") ?? "")
    .get()
    .map((href) => /^(?:https?:\/\/[^/]+)?\/carprice\/([^/]+)\/?$/.exec(href)?.[1])
    .filter((slug): slug is string => slug !== undefined && slug !== "");

  return [...new Set(slugs)];
}

/** `/carprice/<maker>/<model>/` links from a maker's page. */
export function modelHrefsFrom(html: string): string[] {
  const $ = cheerio.load(html);
  const hrefs = $("a[href*='/carprice/']")
    .map((_, a) => $(a).attr("href") ?? "")
    .get()
    .filter((href) => /\/carprice\/[^/]+\/[^/]+\/$/.test(href));

  return [...new Set(hrefs)];
}

/**
 * The model's name and Jalali span, read from its page title.
 *
 * The name is taken as everything before the span, rather than by stripping
 * known words off the end. Stripping is what broke this the first time: an
 * alternation on "و" (for "صفر و کارکرده") also matches the final letter of
 * "پژو", and truncated every Peugeot in the catalog to "پژ".
 */
export function parseModelTitle(
  title: string,
): { nameFa: string; yearStart: number; yearEnd: number } | null {
  const latin = toLatinDigits(title);
  const span = /(\d{4})\s*[-–—]\s*(\d{4})/.exec(latin);
  if (span === null) return null;

  const nameFa = latin
    .slice(0, span.index)
    .replace(/^\s*قیمت\s*/u, "")
    .replace(/\s*صفر\s*و\s*کارکرده\s*$/u, "")
    .replace(/\s*(صفر|کارکرده)\s*$/u, "")
    .trim();
  if (nameFa === "") return null;

  return { nameFa, yearStart: Number(span[1]), yearEnd: Number(span[2]) };
}

async function main() {
  const { maker } = parseArgs(process.argv.slice(2));

  const makers = maker !== null ? [maker] : makerSlugsFrom(await fetchPage(INDEX));
  console.log(`${makers.length} maker(s)\n`);

  const models: EnrichmentModel[] = [];
  const problems: { sourceUrl: string; issue: string }[] = [];

  for (const [index, slug] of makers.entries()) {
    const makerUrl = `${ORIGIN}/carprice/${slug}/`;
    let hrefs: string[];
    try {
      hrefs = modelHrefsFrom(await fetchPage(makerUrl));
    } catch (error) {
      problems.push({ sourceUrl: makerUrl, issue: describe(error) });
      console.log(`  ! ${slug} — ${describe(error)}`);
      continue;
    }

    for (const href of hrefs) {
      const url = absolute(href);
      try {
        const $ = cheerio.load(await fetchPage(url));
        const parsed = parseModelTitle($("title").text().trim());
        if (parsed === null) {
          problems.push({ sourceUrl: url, issue: "no year span in the page title" });
          continue;
        }

        // Derived from the value, not read off the page. A span whose ends
        // disagree is two facts printed together, not a range — hamrah's model
        // pages mix used-car (Jalali) and zero-km (Gregorian) sections, so this
        // is a real shape and not a hypothetical one.
        const startCalendar = calendarForYear(parsed.yearStart);
        if (startCalendar === null || startCalendar !== calendarForYear(parsed.yearEnd)) {
          problems.push({
            sourceUrl: url,
            issue: `span ${parsed.yearStart}-${parsed.yearEnd} is not one calendar`,
          });
          continue;
        }
        if (parsed.yearEnd < parsed.yearStart) {
          problems.push({
            sourceUrl: url,
            issue: `span ${parsed.yearStart}-${parsed.yearEnd} runs backwards`,
          });
          continue;
        }

        models.push({
          makerSlug: slug,
          modelSlug: decodeURIComponent(href.split("/").filter(Boolean).at(-1) ?? ""),
          nameFa: parsed.nameFa,
          yearStart: parsed.yearStart,
          yearEnd: parsed.yearEnd,
          yearCalendar: startCalendar,
          sourceUrl: url,
        });
      } catch (error) {
        problems.push({ sourceUrl: url, issue: describe(error) });
      }
    }

    console.log(`  [${index + 1}/${makers.length}] ${slug}: ${hrefs.length} models`);
  }

  const file = {
    _meta: {
      source: "hamrah-mechanic" as const,
      extractedAt: new Date().toISOString(),
      makers,
    },
    models,
    problems,
  };

  const parsed = parseEnrichmentFile(OUT_FILE, file);
  if (!parsed.success) {
    throw new Error(
      `Refusing to write an invalid file:\n  ${parsed.errors.slice(0, 20).join("\n  ")}`,
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, OUT_FILE), JSON.stringify(file, null, 2), "utf8");
  console.log(
    `\nWrote ${path.join(OUT_DIR, OUT_FILE)} — ${models.length} models, ${problems.length} problems.`,
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0].slice(0, 120) : String(error);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
