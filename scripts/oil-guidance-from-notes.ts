// Seeds each profile's engine-oil viscosity grades from the "نکته" block the
// oil-city import already captured.
//
//   pnpm tsx scripts/oil-guidance-from-notes.ts --dry-run
//   pnpm tsx scripts/oil-guidance-from-notes.ts
//
// **This is a head start, not the answer.** Of the 660 profiles carrying an
// engine-oil note, only ~88 have a viscosity actually filled in — the rest
// publish the same template with the slots empty ("ویسکوزیته مناسب: ؛ مناسب
// برای تمام فصول"). Everything else in that block has to be written by someone
// who knows the car.
//
// Two things the source says are deliberately NOT copied:
//
//   - **The standards list.** 541 profiles carry a byte-identical
//     "SNSN PLUSSMSPSQSLSJ" regardless of the car. It names SQ, which is not a
//     published API category, and SJ/SL/SM, which are superseded — SJ was
//     current in 1996. A list that is the same on every car and half wrong is
//     not a recommendation, and writing it would make the card look authored
//     when it is not.
//   - **The prose.** In the filled-in minority it is the same two sentences
//     with the grades substituted in, which the card can already say from the
//     grades themselves.
//
// One thing IS corrected on the way in. The source has three slots and only
// ever two distinct grades to put in them, so it repeats one — and which one
// varies: 52 profiles repeat the all-season grade into "very cold", 34 repeat
// it into "very hot". A grade cannot be both the year-round answer and the
// answer for when the year-round one stops working, so the repeat is dropped
// rather than stored — the same rule `fitmentProfileCreateSchema` enforces for
// anything typed by hand.
//
// The capacity is the exception to all of the above: it is the one part of the
// block the source reliably fills in — 647 of 660 cars state both figures, all
// of them plausible — so it is copied. One car states them the wrong way round
// and has both dropped rather than guessed at.
//
// Writes column by column and only where the column is still empty, so a run
// can never overwrite what a person entered, and a car that already has its
// grades still picks up its capacity.

import { prisma } from "../lib/db";

const ALL_SEASON = /([0-9]{1,2}w[0-9]{1,2})\s*؛?\s*مناسب برای تمام فصول/i;
const VERY_COLD = /([0-9]{1,2}w[0-9]{1,2})\s*؛?\s*مناسب برای دماهای بسیار سرد/i;
const VERY_HOT = /([0-9]{1,2}w[0-9]{1,2})\s*؛?\s*مناسب برای دماهای بسیار گرم/i;
const CAPACITY_NO_FILTER = /بدون تعویض فیلتر روغن\s*:?\s*حدود\s*([0-9.]+)\s*لیتر/i;
const CAPACITY_WITH_FILTER = /همراه با تعویض فیلتر روغن\s*:?\s*حدود\s*([0-9.]+)\s*لیتر/i;

/** Litres as the note writes them, as the millilitres the column stores. */
function capacityMl(raw: string | undefined): number | null {
  if (!raw) return null;
  const litres = Number(raw);
  if (!Number.isFinite(litres)) return null;
  const ml = Math.round(litres * 1000);
  // The same rails the schema enforces — a figure outside them is a slipped
  // decimal point, not a car.
  return ml >= 500 && ml <= 20_000 ? ml : null;
}

/** "5w30" as the catalog writes it — `viscositySchema` uppercases and hyphenates. */
function normaliseGrade(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^([0-9]{1,2})w([0-9]{1,2})$/i.exec(raw.trim());
  return match ? `${match[1]}W-${match[2]}` : null;
}

class DryRunRollback extends Error {}

function parseArgs(argv: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument "${arg}". Usage: oil-guidance-from-notes.ts [--dry-run]`);
  }
  return { dryRun };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const items = await prisma.fitmentProfileItem.findMany({
    where: { category: { partType: "ENGINE_OIL" }, specNote: { not: null } },
    select: {
      specNote: true,
      profile: {
        select: {
          id: true,
          label: true,
          oilViscosityStandard: true,
          oilViscosityHot: true,
          oilViscosityCold: true,
          oilCapacityNoFilterMl: true,
          oilCapacityWithFilterMl: true,
        },
      },
    },
  });

  // One note per profile: the sections repeat it across every oil item.
  const notes = new Map<string, { profile: (typeof items)[number]["profile"]; note: string }>();
  for (const item of items) {
    if (!notes.has(item.profile.id)) {
      notes.set(item.profile.id, { profile: item.profile, note: item.specNote! });
    }
  }

  console.log(
    `${notes.size} profiles carry an engine-oil note${dryRun ? " — DRY RUN, nothing will be written" : ""}\n`,
  );

  let written = 0;
  let blank = 0;
  let alreadySet = 0;
  let coldDropped = 0;
  let hotDropped = 0;
  let capacitiesWritten = 0;
  const capacityRejected: string[] = [];
  const examples: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const { profile, note } of notes.values()) {
          const standard = normaliseGrade(ALL_SEASON.exec(note)?.[1]);
          let hot = normaliseGrade(VERY_HOT.exec(note)?.[1]);
          let cold = normaliseGrade(VERY_COLD.exec(note)?.[1]);

          // The source's own contradiction — see the header. It fills two
          // distinct grades into three slots and repeats one of them, and WHICH
          // one it repeats varies: the Genesis Coupe duplicates the cold slot,
          // the Azera duplicates the hot one. Either way the repeat says
          // nothing, so it is dropped rather than shown as a second
          // recommendation that happens to match the first.
          if (cold !== null && cold === standard) {
            cold = null;
            coldDropped++;
          }
          if (hot !== null && hot === standard) {
            hot = null;
            hotDropped++;
          }

          let capacityNoFilter = capacityMl(CAPACITY_NO_FILTER.exec(note)?.[1]);
          let capacityWithFilter = capacityMl(CAPACITY_WITH_FILTER.exec(note)?.[1]);

          // A new filter has to be filled too, so the with-filter figure is the
          // larger. One imported car states them the other way round (Samand
          // XU7: 4.5 without, 4.1 with). Neither figure can be trusted once they
          // disagree about which is which, so both are dropped and reported —
          // guessing that they were merely swapped would be inventing a spec.
          if (
            capacityNoFilter !== null &&
            capacityWithFilter !== null &&
            capacityWithFilter <= capacityNoFilter
          ) {
            capacityNoFilter = null;
            capacityWithFilter = null;
            capacityRejected.push(profile.label);
          }

          if (
            standard === null &&
            hot === null &&
            cold === null &&
            capacityNoFilter === null &&
            capacityWithFilter === null
          ) {
            blank++;
            continue;
          }

          // Field by field, filling only what is still empty. All-or-nothing
          // would have skipped the capacity on every car that already got its
          // grades from an earlier run, and a profile is edited a column at a
          // time in the admin anyway.
          const data: Record<string, string | number | null> = {};
          const fill = (column: string, stored: unknown, parsed: string | number | null) => {
            if (stored === null && parsed !== null) data[column] = parsed;
          };
          fill("oilViscosityStandard", profile.oilViscosityStandard, standard);
          fill("oilViscosityHot", profile.oilViscosityHot, hot);
          fill("oilViscosityCold", profile.oilViscosityCold, cold);
          fill("oilCapacityNoFilterMl", profile.oilCapacityNoFilterMl, capacityNoFilter);
          fill("oilCapacityWithFilterMl", profile.oilCapacityWithFilterMl, capacityWithFilter);

          if (Object.keys(data).length === 0) {
            alreadySet++;
            continue;
          }

          await tx.fitmentProfile.update({ where: { id: profile.id }, data });
          if ("oilCapacityWithFilterMl" in data) capacitiesWritten++;
          written++;
          if (examples.length < 12) {
            examples.push(
              `${profile.label}\n      all-season ${standard ?? "—"} · hot ${hot ?? "—"} · cold ${cold ?? "—"}`,
            );
          }
        }

        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  console.log(`profiles updated          ${written}`);
  console.log(`  ...cold slot dropped as a duplicate of the all-season one: ${coldDropped}`);
  console.log(`  ...hot slot dropped for the same reason:                     ${hotDropped}`);
  console.log(`capacities written        ${capacitiesWritten}`);
  if (capacityRejected.length > 0) {
    console.log(`  ...pairs dropped as contradictory (with-filter not larger): ${capacityRejected.length}`);
    for (const label of capacityRejected) console.log(`      ${label}`);
  }
  console.log(`source left every slot empty ${blank}`);
  console.log(`nothing left to fill        ${alreadySet}`);
  console.log(`\nexamples:`);
  for (const line of examples) console.log(`   ${line}`);
  console.log(
    `\nStandards and the guidance note are left empty on purpose — see the header.` +
      `\nThey are the part someone has to write.`,
  );
  if (dryRun) console.log("\nDRY RUN — rolled back, nothing was written.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
