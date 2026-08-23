// Fills in real year spans on cars the oil-city import created, from the years
// those cars state in their own names.
//
//   pnpm tsx scripts/enrich-years.ts --dry-run
//   pnpm tsx scripts/enrich-years.ts
//
// **Why this is not part of the importer.** `scripts/import.ts` writes a car
// type's year span at CREATE time and never updates it, and it refuses to write
// to any row it did not create. Both rules are deliberate: they are what lets a
// human narrow an imported span by hand and keep that work through every later
// re-import. So applying years is an UPDATE to importer-owned rows, which is
// precisely the thing the importer exists to refuse — it needs its own script,
// with its own constraints.
//
// The constraints, all load-bearing:
//
//   - It writes ONLY yearStart, yearEnd and yearCalendar. Not names, not slugs,
//     not status, not fitment.
//   - It writes ONLY to rows whose sourceRef begins "oil-city:". A hand-entered
//     car was entered by someone who knew the years; leave it alone.
//   - It NEVER touches a span a human has already changed. The import leaves a
//     known placeholder (IMPORTED_YEAR_START in the imported calendar); a span
//     that differs from it has been worked on, and is skipped and reported.
//   - --dry-run runs the real code path in a transaction it rolls back.
//
// This is the first of two providers. It covers the ~32% of models that state a
// full span; Task F.4 scrapes hamrah-mechanic for the rest and feeds the same
// update path.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";
import { findExactModel, matchKey, parseYearSpanFromName } from "../lib/enrich";
import { IMPORTED_YEAR_CALENDAR, IMPORTED_YEAR_START, toLatinDigits } from "../lib/import";
import { parseEnrichmentFile, type EnrichmentModel } from "../lib/validation/enrichment";

const SOURCE_PREFIX = "oil-city:";
const MAX_PRINTED = 20;
const HAMRAH_FILE = path.join("scrape", "hamrah-mechanic", "models.json");

/**
 * The second provider's models, or none when it has not been scraped.
 *
 * Absent is a normal state, not an error: the first provider (the years a car
 * states in its own name) works without it, and did so for 272 models before
 * this file existed.
 */
async function loadHamrahModels(): Promise<EnrichmentModel[]> {
  let text: string;
  try {
    text = await readFile(HAMRAH_FILE, "utf8");
  } catch {
    console.log(`(no ${HAMRAH_FILE} — running with the model-name provider only)\n`);
    return [];
  }

  const parsed = parseEnrichmentFile(HAMRAH_FILE, JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`${HAMRAH_FILE} is not valid:\n  ${parsed.errors.slice(0, 10).join("\n  ")}`);
  }
  console.log(`${parsed.data.models.length} hamrah-mechanic models loaded\n`);
  return parsed.data.models;
}

function parseArgs(argv: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument "${arg}". Usage: enrich-years.ts [--dry-run]`);
  }
  return { dryRun };
}

/** Thrown to roll a dry run's transaction back — the same trick scripts/import.ts uses. */
class DryRunRollback extends Error {}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const models = await prisma.carModel.findMany({
    where: { sourceRef: { startsWith: SOURCE_PREFIX } },
    select: {
      id: true,
      nameFa: true,
      yearCalendar: true,
      carBrand: { select: { nameFa: true } },
      engines: { select: { id: true, yearStart: true, yearEnd: true } },
    },
  });

  console.log(
    `${models.length} imported car models${dryRun ? " — DRY RUN, nothing will be written" : ""}\n`,
  );

  const hamrah = await loadHamrahModels();

  const updated: string[] = [];
  const fromHamrah: string[] = [];
  const ambiguous: string[] = [];
  const noYears: string[] = [];
  const alreadySet: string[] = [];
  const oddShape: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const model of models) {
        const label = `${model.carBrand.nameFa} ${model.nameFa}`;
        // The car's own name first — free, and already proven on 272 models.
        // hamrah-mechanic is the fallback for the rest, and only ever on an
        // exact name match.
        let span = parseYearSpanFromName(model.nameFa, toLatinDigits);
        let viaHamrah = false;

        if (span === null && hamrah.length > 0) {
          const outcome = findExactModel(matchKey(model.carBrand.nameFa, model.nameFa), hamrah);
          if (outcome.kind === "matched") {
            span = {
              yearStart: outcome.model.yearStart,
              yearEnd: outcome.model.yearEnd,
              yearCalendar: outcome.model.yearCalendar,
            };
            viaHamrah = true;
          } else if (outcome.kind === "ambiguous") {
            ambiguous.push(`${label} — ${outcome.count} hamrah-mechanic models share this name`);
          }
        }

        if (span === null) {
          noYears.push(label);
          continue;
        }

        // The importer synthesises exactly one engine per model. More than one,
        // or none, means a human has been here — the same reasoning the importer
        // itself uses before it stops touching a model's engines.
        if (model.engines.length !== 1) {
          oddShape.push(`${label} — ${model.engines.length} types`);
          continue;
        }

        const engine = model.engines[0];
        const isUntouched =
          engine.yearStart === IMPORTED_YEAR_START &&
          engine.yearEnd === null &&
          model.yearCalendar === IMPORTED_YEAR_CALENDAR;

        if (!isUntouched) {
          alreadySet.push(`${label} — ${engine.yearStart}–${engine.yearEnd ?? "present"}`);
          continue;
        }

        await tx.carModel.update({
          where: { id: model.id },
          data: { yearCalendar: span.yearCalendar },
        });
        await tx.carEngine.update({
          where: { id: engine.id },
          data: { yearStart: span.yearStart, yearEnd: span.yearEnd },
        });
        const line = `${label} → ${span.yearStart}–${span.yearEnd} ${span.yearCalendar}`;
        (viaHamrah ? fromHamrah : updated).push(line);
      }

      if (dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  const report = (title: string, rows: string[]) => {
    console.log(`\n  ${title} (${rows.length}):`);
    for (const row of rows.slice(0, MAX_PRINTED)) console.log(`    ${row}`);
    if (rows.length > MAX_PRINTED) console.log(`    …and ${rows.length - MAX_PRINTED} more`);
  };

  report("Years read from the model's own name", updated);
  report("Years from hamrah-mechanic, exact name match", fromHamrah);
  report("Left alone — the name matches more than one hamrah-mechanic model", ambiguous);
  // Not necessarily a human: a previous run of this script leaves exactly the
  // same trace. Either way the span is no longer the import's placeholder, and
  // re-deriving it from the name would undo whatever narrowed it.
  report("Left alone — already has a real span", alreadySet);
  report("Left alone — not one imported type", oddShape);
  console.log(
    `\n  No year found by either provider (${noYears.length}) — the car keeps the` +
      ` import's wide placeholder until somebody sets a span by hand.`,
  );

  console.log(
    `\nSummary: ${updated.length} from names, ${fromHamrah.length} from hamrah-mechanic, ` +
      `${alreadySet.length} already set, ${ambiguous.length} ambiguous, ` +
      `${oddShape.length} odd shape, ${noYears.length} still without years.`,
  );
  if (dryRun) console.log("DRY RUN — the transaction above was rolled back.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
