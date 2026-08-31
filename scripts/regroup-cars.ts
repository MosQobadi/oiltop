// Folds the flat car rows the oil-city import created into models and types.
//
//   pnpm tsx scripts/regroup-cars.ts --dry-run
//   pnpm tsx scripts/regroup-cars.ts
//
// **What it fixes.** oil-city has no types — a whole car identity is one string,
// "i20 مدل 2016-2017 و کرمان موتور" — so the importer wrote each of their models
// as one of ours with a single synthesised engine whose label repeated the model
// name. 803 of 806 models had exactly one type, and the finder's model step
// listed year spans and gearboxes instead of cars. `lib/cars/regroup.ts` takes
// those names apart; this script applies the result.
//
// **What it guarantees.** Every type survives. Two rows that fold into one model
// become two types under it, and the run aborts before committing if the type
// count changes or if any model ends up with two types a customer could not tell
// apart. A regrouping that quietly dropped a car would drop its fitment with it.
//
// **What it does not touch.** Fitment profiles and their links, products,
// inventory, orders. Engines keep their ids, so every CarEngineFitmentProfile
// row still points at the same type it did before.

import { prisma } from "../lib/db";
import {
  groupKey,
  normaliseName,
  preferredSpelling,
  resolveTypeLabel,
  splitCarName,
} from "../lib/cars/regroup";
import { fallbackSlug, IMPORTED_YEAR_START, MIN_LATIN_SLUG_LENGTH } from "../lib/import";
import { slugify } from "../lib/slug";
import { calendarForYear, type YearCalendar } from "../lib/year";

function parseArgs(argv: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument "${arg}". Usage: regroup-cars.ts [--dry-run]`);
  }
  return { dryRun };
}

/** Thrown to roll a dry run's transaction back — the trick scripts/import.ts uses. */
class DryRunRollback extends Error {}

interface EngineRow {
  id: string;
  labelFa: string;
  labelEn: string;
  yearStart: number;
  yearEnd: number | null;
  sourceRef: string | null;
}

interface ModelRow {
  id: string;
  nameFa: string;
  slug: string;
  sourceRef: string | null;
  yearCalendar: YearCalendar;
  image: string | null;
  engines: EngineRow[];
}

const isPlaceholderSpan = (engine: EngineRow) =>
  engine.yearStart === IMPORTED_YEAR_START && engine.yearEnd === null;

/**
 * The row that survives a group, and keeps its id.
 *
 * A hand-entered model wins outright: it is the one carrying an image, SEO
 * fields and real engine labels that nobody wants to re-enter. Otherwise the
 * row whose name is already the model name, then the one with the most types.
 */
function chooseSurvivor(models: ModelRow[], base: string): ModelRow {
  const handEntered = models.filter((model) => model.sourceRef === null);
  const pool = handEntered.length > 0 ? handEntered : models;
  const exact = pool.filter((model) => groupKey(model.nameFa) === groupKey(base));
  const candidates = exact.length > 0 ? exact : pool;
  return [...candidates].sort(
    (a, b) => b.engines.length - a.engines.length || a.id.localeCompare(b.id),
  )[0];
}

/**
 * The calendar a merged model states.
 *
 * Only spans a human or the enrichment pass actually established get a vote —
 * the import stamps GREGORIAN on every row it creates, so a placeholder span
 * saying "Gregorian" is the default talking, not a fact about the car. Three
 * models genuinely mix the two (a locally assembled Accent sold by Jalali year
 * beside an imported one sold by Gregorian); the majority wins here and the
 * minority still displays correctly, because `formatYearSpan` reads the calendar
 * off the year value rather than off this column. What the column drives is the
 * admin form's range check, which `server/carEngine.ts` widens for exactly these
 * models.
 */
function chooseCalendar(engines: EngineRow[], fallback: YearCalendar): YearCalendar {
  const votes = new Map<YearCalendar, number>();
  for (const engine of engines) {
    if (isPlaceholderSpan(engine)) continue;
    const calendar = calendarForYear(engine.yearStart);
    if (calendar === null) continue;
    votes.set(calendar, (votes.get(calendar) ?? 0) + 1);
  }
  if (votes.size === 0) return fallback;
  return [...votes].sort((a, b) => b[1] - a[1])[0][0];
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const brands = await prisma.carBrand.findMany({
    select: {
      id: true,
      nameFa: true,
      models: {
        select: {
          id: true,
          nameFa: true,
          slug: true,
          sourceRef: true,
          yearCalendar: true,
          image: true,
          engines: {
            select: {
              id: true,
              labelFa: true,
              labelEn: true,
              yearStart: true,
              yearEnd: true,
              sourceRef: true,
            },
          },
        },
      },
    },
  });

  const modelsBefore = brands.reduce((sum, brand) => sum + brand.models.length, 0);
  const enginesBefore = brands.reduce(
    (sum, brand) => sum + brand.models.reduce((n, model) => n + model.engines.length, 0),
    0,
  );

  console.log(
    `${modelsBefore} car models, ${enginesBefore} types${
      dryRun ? " — DRY RUN, nothing will be written" : ""
    }\n`,
  );

  let groupsTotal = 0;
  let modelsRenamed = 0;
  let modelsDeleted = 0;
  let enginesMoved = 0;
  let enginesRelabelled = 0;
  let labelsKept = 0;
  const notes: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const brand of brands) {
          // ---- group this brand's rows by the model name they resolve to ----
          const groups = new Map<
            string,
            { display: string; models: ModelRow[]; labels: Map<string, string | null> }
          >();

          for (const model of brand.models) {
            const { base, type } = splitCarName(brand.nameFa, model.nameFa);
            const key = groupKey(base);
            let group = groups.get(key);
            if (!group) {
              group = { display: base, models: [], labels: new Map() };
              groups.set(key, group);
            }
            group.display = preferredSpelling(group.display, base);
            group.models.push(model as ModelRow);
            // Every engine on this model inherits the type its model name states.
            for (const engine of model.engines) group.labels.set(engine.id, type);
          }

          for (const group of groups.values()) {
            groupsTotal++;
            const survivor = chooseSurvivor(group.models, group.display);
            const engines = group.models.flatMap((model) => model.engines);
            const modelName = group.display;

            // ---- decide each type's label ----
            const desired = new Map<string, string>();
            for (const model of group.models) {
              for (const engine of model.engines) {
                // A label a person wrote is never overwritten. The import copies
                // the model name into the label verbatim, so a label that differs
                // from its model's name is one somebody entered by hand —
                // "۱.۸ لیتر بنزینی XU7" on the seeded Pars, which is worth more
                // than anything derivable from a name.
                const isImportCopy = normaliseName(engine.labelFa) === normaliseName(model.nameFa);
                if (!isImportCopy) {
                  desired.set(engine.id, engine.labelFa);
                  labelsKept++;
                  continue;
                }
                desired.set(
                  engine.id,
                  resolveTypeLabel(group.labels.get(engine.id) ?? null, modelName, engines.length),
                );
              }
            }

            // ---- guard: two types a customer could not tell apart ----
            const seen = new Map<string, number>();
            for (const label of desired.values()) {
              seen.set(label, (seen.get(label) ?? 0) + 1);
            }
            for (const [label, count] of seen) {
              if (count > 1) {
                throw new Error(
                  `${brand.nameFa} / ${modelName}: ${count} types would both be called ` +
                    `"${label}". Refusing to write a model whose options are indistinguishable.`,
                );
              }
            }

            // ---- move every engine onto the survivor, relabelled ----
            for (const model of group.models) {
              for (const engine of model.engines) {
                const label = desired.get(engine.id)!;
                const movingModel = model.id !== survivor.id;
                const relabelling = engine.labelFa !== label || engine.labelEn !== label;
                // The source URL key belongs to the type from here on: one
                // oil-city page describes one version of one car.
                const sourceRef = engine.sourceRef ?? model.sourceRef;

                if (!movingModel && !relabelling && engine.sourceRef === sourceRef) continue;

                await tx.carEngine.update({
                  where: { id: engine.id },
                  data: {
                    carModelId: survivor.id,
                    labelFa: label,
                    labelEn: label,
                    sourceRef,
                  },
                });
                if (movingModel) enginesMoved++;
                if (relabelling) enginesRelabelled++;
              }
            }

            // ---- drop the rows the group folded away ----
            const absorbed = group.models.filter((model) => model.id !== survivor.id);
            if (absorbed.length > 0) {
              await tx.carModel.deleteMany({
                where: { id: { in: absorbed.map((model) => model.id) } },
              });
              modelsDeleted += absorbed.length;
            }

            // ---- rename the survivor, after the others are gone ----
            // Done last so a slug freed by a deleted sibling is available: the
            // i20 group's survivor wants the slug "i20", which its sibling held.
            const calendar = chooseCalendar(engines, survivor.yearCalendar);
            const image = survivor.image ?? group.models.find((m) => m.image !== null)?.image ?? null;

            // The slug follows the model's own name, under the rule `deriveSlug`
            // already uses: a Latin remnant shorter than three characters is not
            // a name. Keeping the survivor's old slug is what would be wrong
            // here — it was derived from the source URL of ONE of the rows that
            // just became a type, so the Kona whose types are 2018-2020 and
            // 2023-2025 was answering at /cars/hyundai/2018-2020. A stable hash
            // is unreadable, but it does not tell the customer the wrong thing.
            const latin = slugify(modelName);
            // A slug somebody chose — "tucson" on the seeded Tucson — outlives
            // a regrouping. It is told apart from an imported one by having
            // real letters in it: the slugs this has to replace are the ones
            // derived from the source URL of ONE of the rows that just became a
            // type, and those read "2018-2020" or "2013". Kona was answering at
            // /cars/hyundai/2018-2020, which is worse than unreadable.
            const curated =
              /[a-z]{3,}/.test(survivor.slug) && !survivor.slug.startsWith("car-model-");
            let slug =
              latin.length >= MIN_LATIN_SLUG_LENGTH
                ? latin.slice(0, 80)
                : curated
                  ? survivor.slug
                  : fallbackSlug("car-model", `car-model/${brand.nameFa}/${modelName}`);
            if (slug !== survivor.slug) {
              const taken = await tx.carModel.findFirst({
                where: { carBrandId: brand.id, slug, id: { not: survivor.id } },
                select: { id: true },
              });
              // Two models wanting one slug — "911 کاررا" and "911 کررا 4" both
              // slugify to "911". The one that got there first keeps it.
              if (taken) {
                slug = fallbackSlug("car-model", `car-model/${brand.nameFa}/${modelName}`);
              }
            }

            const renaming =
              normaliseName(survivor.nameFa) !== normaliseName(modelName) ||
              survivor.slug !== slug ||
              survivor.yearCalendar !== calendar ||
              survivor.sourceRef !== null ||
              survivor.image !== image;

            if (renaming) {
              await tx.carModel.update({
                where: { id: survivor.id },
                data: {
                  nameFa: modelName,
                  nameEn: modelName,
                  slug,
                  yearCalendar: calendar,
                  image,
                  // The source key now lives on the types. Leaving it here would
                  // have the model "i20" claim to be sourced from the page for
                  // "i20 2009-2015", and would let a re-import match it.
                  sourceRef: null,
                },
              });
              modelsRenamed++;
            }

            if (group.models.length > 1) {
              notes.push(
                `${brand.nameFa} / ${modelName}: ${group.models.length} rows → ${engines.length} types`,
              );
            }
          }
        }

        // ---- guard: nothing may be lost ----
        const enginesAfter = await tx.carEngine.count();
        const modelsAfter = await tx.carModel.count();
        if (enginesAfter !== enginesBefore) {
          throw new Error(
            `Type count changed: ${enginesBefore} before, ${enginesAfter} after. ` +
              `Every type must survive a regrouping. Rolling back.`,
          );
        }
        // A model left with no types is a car a customer can select and get
        // nothing from — the regrouping should have deleted it, not stranded it.
        const empty = await tx.carModel.count({ where: { engines: { none: {} } } });
        if (empty > 0) {
          throw new Error(`${empty} models were left with no types. Rolling back.`);
        }

        console.log(`models  ${modelsBefore} → ${modelsAfter}`);
        console.log(`types   ${enginesBefore} → ${enginesAfter}   (unchanged, as required)`);
        console.log(`groups formed            ${groupsTotal}`);
        console.log(`models renamed           ${modelsRenamed}`);
        console.log(`models folded away       ${modelsDeleted}`);
        console.log(`types moved to a new model ${enginesMoved}`);
        console.log(`types relabelled         ${enginesRelabelled}`);
        console.log(`hand-written labels kept ${labelsKept}`);

        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 300_000 },
    );
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log("\nDRY RUN — rolled back, nothing was written.");
      return;
    }
    throw error;
  }

  console.log("\nCommitted.");
  if (notes.length > 0) {
    console.log(`\n${notes.length} models gained more than one type:`);
    for (const note of notes.slice(0, 30)) console.log(`  ${note}`);
    if (notes.length > 30) console.log(`  … and ${notes.length - 30} more`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
