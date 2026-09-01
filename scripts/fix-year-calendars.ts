// Brings every car model's `yearCalendar` in line with lib/cars/calendar.ts,
// and relabels the year spans that were recorded in the wrong calendar.
//
//   pnpm tsx scripts/fix-year-calendars.ts --dry-run
//   pnpm tsx scripts/fix-year-calendars.ts
//
// **Why this is not part of enrich-years.ts.** That script fills in years a car
// states in its own name and refuses to touch a span a human has narrowed. This
// one corrects the *calendar* those years were filed under, which is a
// different claim about a different column, and it has to be able to overwrite
// enriched spans — the wrong calendar is exactly what enrichment produced for
// «پژو پارس 2000 تا 2020». Running it is safe to repeat: a model already in the
// right calendar is skipped.
//
// The constraints:
//
//   - It writes ONLY CarModel.yearCalendar, CarEngine.yearStart and
//     CarEngine.yearEnd. Nothing else.
//   - It touches only cars lib/cars/calendar.ts classifies. An unclassified
//     brand is reported and left exactly as it is.
//   - A span is relabelled (±621) only when it is stored in the wrong calendar
//     for its car. The importer's placeholder is left alone for enrichment.
//   - Types that are genuinely a different car from their model — an import
//     filed under a domestic model — are reported for a split, never
//     relabelled. Relabelling those would turn a real 2024 import into a
//     fictional 1403 one.
//   - --dry-run runs the real code path in a transaction it rolls back.

import { prisma } from "../lib/db";
import { calendarForCar, relabelYear } from "../lib/cars/calendar";
import { IMPORTED_YEAR_START } from "../lib/import";
import { calendarForYear } from "../lib/year";

/**
 * Types that contradict their model because they ARE a different car, not
 * because the calendar was misfiled. Keyed "<brand>|<model>|<type label>".
 *
 * The catalog holds these as one model because the source did, and one
 * `yearCalendar` column cannot describe both. They need splitting into their
 * own model by hand; until then this script leaves them untouched rather than
 * inventing a year for them.
 */
const NEEDS_SPLIT = new Set(["مزدا|3|وارداتی 2023-2025"]);

function parseArgs(argv: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument "${arg}". Usage: fix-year-calendars.ts [--dry-run]`);
  }
  return { dryRun };
}

/** Thrown to roll a dry run's transaction back — the trick scripts/import.ts uses. */
class DryRunRollback extends Error {}

/** Whether this span is the placeholder the importer writes at create time. */
function isPlaceholder(yearStart: number, yearEnd: number | null): boolean {
  return yearStart === IMPORTED_YEAR_START && yearEnd === null;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const models = await prisma.carModel.findMany({
    select: {
      id: true,
      nameFa: true,
      yearCalendar: true,
      carBrand: { select: { nameFa: true } },
      engines: { select: { id: true, labelFa: true, yearStart: true, yearEnd: true } },
    },
  });

  console.log(
    `${models.length} car models${dryRun ? " — DRY RUN, nothing will be written" : ""}\n`,
  );

  const calendarFlips: string[] = [];
  const spanRelabels: string[] = [];
  const splits: string[] = [];
  const unclassified = new Map<string, number>();
  let alreadyRight = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const model of models) {
        const brand = model.carBrand.nameFa;
        const want = calendarForCar(brand, model.nameFa);

        if (want === null) {
          unclassified.set(brand, (unclassified.get(brand) ?? 0) + 1);
          continue;
        }

        const label = `${brand} | ${model.nameFa}`;

        if (want !== model.yearCalendar) {
          await tx.carModel.update({ where: { id: model.id }, data: { yearCalendar: want } });
          calendarFlips.push(`${label}: ${model.yearCalendar} -> ${want}`);
        } else {
          alreadyRight += 1;
        }

        // Now the spans, against the calendar the model ends up in.
        for (const engine of model.engines) {
          if (isPlaceholder(engine.yearStart, engine.yearEnd)) continue;

          const stored = calendarForYear(engine.yearStart);
          if (stored === null || stored === want) continue;

          const key = `${brand}|${model.nameFa}|${engine.labelFa}`;
          if (NEEDS_SPLIT.has(key)) {
            splits.push(
              `${label} | ${engine.labelFa} = ${engine.yearStart}-${engine.yearEnd ?? "?"} (${stored}, model is ${want})`,
            );
            continue;
          }

          const yearStart = relabelYear(engine.yearStart, want);
          const yearEnd = engine.yearEnd === null ? null : relabelYear(engine.yearEnd, want);

          await tx.carEngine.update({ where: { id: engine.id }, data: { yearStart, yearEnd } });
          spanRelabels.push(
            `${label} | ${engine.labelFa}: ${engine.yearStart}-${engine.yearEnd ?? "?"} -> ${yearStart}-${yearEnd ?? "?"}`,
          );
        }
      }

      if (dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  const report = (title: string, lines: string[], max = 200) => {
    console.log(`${title}: ${lines.length}`);
    for (const line of lines.slice(0, max)) console.log(`  ${line}`);
    if (lines.length > max) console.log(`  ... and ${lines.length - max} more`);
    console.log("");
  };

  report("Calendar corrected", calendarFlips);
  report("Year spans relabelled", spanRelabels);
  report("Needs a model split — left untouched", splits);

  console.log(`Already correct: ${alreadyRight}`);
  const unclassifiedTotal = [...unclassified.values()].reduce((a, b) => a + b, 0);
  console.log(`Unclassified (left untouched): ${unclassifiedTotal} models`);
  for (const [brand, count] of [...unclassified].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${brand}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
