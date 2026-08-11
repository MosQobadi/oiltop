// Catalog importer. Reads every batch file for a source, validates each with
// D.1's schema, and upserts in dependency order:
//
//   Category (holding) -> Brand -> Product (+Inventory) -> CarBrand -> CarModel
//     -> CarEngine -> FitmentProfile (+items) -> CarEngineFitmentProfile
//
//   pnpm tsx scripts/import.ts --source oil-city --dry-run
//   pnpm tsx scripts/import.ts --source oil-city
//
// Two rules run through all of it.
//
// **It only ever owns what it created.** `sourceRef` is the idempotency key: a
// row carrying ours is updated, and a row without one is never written to. Where
// a hand-entered row is clearly the same thing (a Brand or CarBrand of the same
// Persian name), the importer *adopts* it — links to it, leaves it untouched,
// and says so — rather than creating a second row for the same brand.
//
// **A second run changes nothing.** Every update is diffed against what is
// stored and skipped when identical, so the second run reports "unchanged"
// rather than rewriting every row's updatedAt. Some columns are written only at
// create time and never updated at all, because they are the ones a human
// improves after the import: status (the review gate), slug (a URL), a car
// engine's year span (DECISION 1 leaves it deliberately wide), and a product's
// category when the source had no guess to offer.
//
// Everything the importer creates lands INACTIVE. Imported data has not been
// looked at by anyone, and a product, brand or car reaching the storefront
// unreviewed is the failure this whole phase exists to avoid. Activating is
// D.4's job.
//
// One ordering caveat, since batch files are read in filename order and each is
// its own transaction: a car page whose products live in a *later* file imports
// its items spec-only, because those products don't exist yet when the car is
// read. The next run — with the products present — resolves them, which mints a
// corrected profile and re-links the engine to it. Nothing is lost either way,
// but a source is cheapest to import when its product batches sort before its
// car batches.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { Prisma } from "../lib/generated/prisma/client";
import {
  parseScrapeBatchJson,
  type ScrapeBatch,
  type ScrapeCar,
  type ScrapeProduct,
} from "../lib/validation/import";
import {
  brandLabelDisagrees,
  type CanonicalFitmentRow,
  deriveSku,
  deriveSlug,
  discountPercentFrom,
  ENGINE_LABEL_MAX,
  fallbackSlug,
  fitmentCandidatesFor,
  fitmentHash,
  fitmentProfileLabel,
  fitmentSpecNote,
  IMPORT_HASH_NOTE_PREFIX,
  IMPORTED_YEAR_START,
  importHashNote,
  isImportHashNote,
  LONG_DESCRIPTION_MAX,
  mapFuelType,
  NAME_MAX,
  parseProductSpecs,
  SHORT_DESCRIPTION_MAX,
  sourceRefFor,
  truncate,
  UNCATEGORISED_CATEGORY,
  UNKNOWN_BRAND,
} from "../lib/import";

// A batch of a few hundred records is one transaction, and the default 5s is
// not enough for that over a network. maxWait covers a busy connection pool.
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

// Per-record notes are useful in the dozens and useless in the thousands.
const MAX_PRINTED_NOTES = 25;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type Options = { source: string; dryRun: boolean };

const USAGE = [
  "Usage: pnpm tsx scripts/import.ts --source <name> [--dry-run]",
  "",
  "  --source <name>   reads scrape/<name>/*.json  (e.g. oil-city)",
  "  --dry-run         report every create/update/skip and write nothing",
].join("\n");

function parseArgs(argv: string[]): Options {
  let source: string | null = null;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--source") {
      source = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--source=")) source = arg.slice("--source=".length);
    else throw new Error(`Unknown argument "${arg}".\n\n${USAGE}`);
  }

  if (source === null) throw new Error(`--source is required.\n\n${USAGE}`);
  // The source name is also a directory name and a sourceRef prefix, so it is
  // kept to the shape both can hold — and to something that can't walk out of
  // scrape/.
  if (!/^[a-z0-9-]+$/.test(source)) {
    throw new Error(`Invalid --source "${source}": use lowercase letters, digits and hyphens.`);
  }

  return { source, dryRun };
}

function listBatchFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`No batch directory at ${dir} — scrape a batch into it first.`);
  }

  const files = entries
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .filter((entry) => statSync(path.join(dir, entry)).isFile())
    .sort();

  if (files.length === 0) throw new Error(`No .json batch files in ${dir}.`);
  return files;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const ENTITIES = [
  "categories",
  "brands",
  "products",
  "inventory",
  "carBrands",
  "carModels",
  "carEngines",
  "fitmentProfiles",
  "fitmentItems",
  "fitmentLinks",
] as const;
type Entity = (typeof ENTITIES)[number];

// "unchanged" is not padding: it is the evidence for the second half of the
// DoD. A re-run that reports every row unchanged is a re-run that wrote nothing.
const ACTIONS = ["created", "updated", "unchanged", "skipped"] as const;
type Action = (typeof ACTIONS)[number];

type Counts = Record<Entity, Record<Action, number>>;

function emptyCounts(): Counts {
  return Object.fromEntries(
    ENTITIES.map((entity) => [entity, { created: 0, updated: 0, unchanged: 0, skipped: 0 }]),
  ) as Counts;
}

type FileReport = {
  file: string;
  label: string;
  counts: Counts;
  failure: string | null;
};

function increment(counts: Counts, entity: Entity, action: Action) {
  counts[entity][action] += 1;
}

// What a profile covers, counted over the whole run rather than read back from
// the database — a dry run rolls its writes away, and the point of the exercise
// is a number the dry run can already show. Engines are a Set keyed by the car's
// model ref so the same car appearing in two batch files (or a second run
// linking nothing new) still counts once, and run 1 and run 2 report the same
// coverage.
type ProfileCoverage = { label: string; engines: Set<string> };

// The ten largest is the number that says whether the dedup worked at all.
const MAX_PRINTED_PROFILES = 10;

class ImportReport {
  readonly files: FileReport[] = [];
  readonly invalidFiles: { file: string; errors: string[] }[] = [];
  readonly unmappedCategories = new Map<string, number>();
  readonly unmappedSections = new Map<string, number>();
  readonly missingSectionProducts = new Map<string, number>();
  readonly profiles = new Map<string, ProfileCoverage>();
  // Counted after the run rather than during it — see `countOrphanProfiles`.
  orphanProfiles = 0;
  readonly unmappedFuelWording = new Map<string, number>();
  readonly brandLabelDisagreements: { title: string; label: string; sourceUrl: string }[] = [];
  readonly notes: string[] = [];
  readonly problems: { file: string; sourceUrl: string; issue: string }[] = [];

  // Each batch file is its own transaction, so in a dry run file 2 cannot see
  // what file 1 "created" — a product listed in both would be counted as a
  // create twice and the dry run would promise more than the real run delivers.
  // Tracking the refs across the run and reporting the repeat as unchanged is
  // what makes the two numbers agree.
  private readonly seenRefs = new Set<string>();

  constructor(private readonly options: Options) {}

  startFile(file: string, batch: ScrapeBatch): Counts {
    const report: FileReport = {
      file,
      label: batch._meta.batchLabel,
      counts: emptyCounts(),
      failure: null,
    };
    this.files.push(report);
    for (const problem of batch.problems) {
      this.problems.push({ file, sourceUrl: problem.sourceUrl, issue: problem.issue });
    }
    return report.counts;
  }

  fileFailed(file: string, message: string) {
    const report = this.files.find((entry) => entry.file === file);
    if (report) report.failure = message;
  }

  invalidFile(file: string, errors: string[]) {
    this.invalidFiles.push({ file, errors });
  }

  // The other half of that: a car in file 2 looking for a product from file 1
  // finds nothing in a dry run, because file 1's transaction was rolled back
  // before file 2 opened. Every section would resolve to spec-only, and the dry
  // run would promise a set of profiles the real run then doesn't create — which
  // is exactly the disagreement `--dry-run` exists to rule out. The run's own
  // record of what it imported is the missing half of the answer.
  //
  // Only ever consulted for a profile's *identity*. The row still gets whatever
  // id the database could actually give it, which in a dry run is none.
  dryRunImportedProduct(sourceRef: string): boolean {
    return this.options.dryRun && this.seenRefs.has(sourceRef);
  }

  record(counts: Counts, entity: Entity, action: Action, sourceRef?: string) {
    let effective = action;
    if (sourceRef !== undefined) {
      if (this.options.dryRun && action === "created" && this.seenRefs.has(sourceRef)) {
        effective = "unchanged";
      }
      this.seenRefs.add(sourceRef);
    }
    increment(counts, entity, effective);
  }

  // Items are created in one statement, so they are counted in one call rather
  // than by calling `record` per row — and they carry no ref of their own: an
  // item's identity is the profile's hash, which is already deduplicated above.
  recordMany(counts: Counts, entity: Entity, action: Action, times: number) {
    counts[entity][action] += times;
  }

  note(message: string) {
    this.notes.push(message);
  }

  countUnmappedCategory(wording: string) {
    this.unmappedCategories.set(wording, (this.unmappedCategories.get(wording) ?? 0) + 1);
  }

  countUnmappedSection(heading: string) {
    this.unmappedSections.set(heading, (this.unmappedSections.get(heading) ?? 0) + 1);
  }

  countMissingSectionProduct(name: string) {
    this.missingSectionProducts.set(name, (this.missingSectionProducts.get(name) ?? 0) + 1);
  }

  coverProfile(hash: string, label: string, engineKey: string) {
    const existing = this.profiles.get(hash);
    if (existing) existing.engines.add(engineKey);
    else this.profiles.set(hash, { label, engines: new Set([engineKey]) });
  }

  countUnmappedFuelWording(wording: string) {
    this.unmappedFuelWording.set(wording, (this.unmappedFuelWording.get(wording) ?? 0) + 1);
  }

  disagreement(title: string, label: string, sourceUrl: string) {
    this.brandLabelDisagreements.push({ title, label, sourceUrl });
  }

  private totals(): Counts {
    const totals = emptyCounts();
    for (const file of this.files) {
      for (const entity of ENTITIES) {
        for (const action of ACTIONS) totals[entity][action] += file.counts[entity][action];
      }
    }
    return totals;
  }

  get failed(): boolean {
    return this.invalidFiles.length > 0 || this.files.some((file) => file.failure !== null);
  }

  print() {
    for (const file of this.files) {
      console.log("");
      console.log(`${file.file} — ${file.label}`);
      if (file.failure !== null) {
        console.log(`  FAILED, rolled back: ${file.failure}`);
        console.log("  (the counts below did not apply)");
      }
      printCounts(file.counts, "  ");
    }

    for (const invalid of this.invalidFiles) {
      console.log("");
      console.log(`${invalid.file} — INVALID, not imported`);
      for (const error of invalid.errors.slice(0, MAX_PRINTED_NOTES)) console.log(`  ${error}`);
      if (invalid.errors.length > MAX_PRINTED_NOTES) {
        console.log(`  …and ${invalid.errors.length - MAX_PRINTED_NOTES} more`);
      }
    }

    console.log("");
    console.log("Summary");
    printCounts(this.totals(), "  ");

    this.printFitment();

    printTally(
      this.unmappedCategories,
      `Source categories with no match here — imported into "${UNCATEGORISED_CATEGORY.slug}", INACTIVE`,
    );
    printTally(
      this.unmappedSections,
      `Car page sections with no category match — items filed under "${UNCATEGORISED_CATEGORY.slug}"`,
    );
    printTally(
      this.missingSectionProducts,
      "Products a car page recommends that this catalog doesn't have — imported as spec-only items",
    );
    printTally(this.unmappedFuelWording, "Fuel wording the table doesn't map — no engine created");

    if (this.brandLabelDisagreements.length > 0) {
      console.log("");
      console.log(
        `  Brand labels that disagree with the product title (${this.brandLabelDisagreements.length}) — imported as printed, not corrected:`,
      );
      for (const row of this.brandLabelDisagreements.slice(0, MAX_PRINTED_NOTES)) {
        console.log(`    "${row.title}" is labelled "${row.label}"  ${row.sourceUrl}`);
      }
      printOverflow(this.brandLabelDisagreements.length);
    }

    printList("Notes", this.notes);
    printList(
      "Problems reported by the extractor",
      this.problems.map((problem) => `${problem.file}  ${problem.sourceUrl} — ${problem.issue}`),
    );

    console.log("");
    if (this.options.dryRun) console.log("DRY RUN — every transaction above was rolled back.");
    if (this.failed) console.log("Finished with failures — see the FAILED/INVALID files above.");
  }

  // The evidence for D.3. "Profiles created" alone can't tell you whether the
  // dedup worked — 800 cars and 800 profiles would print the same shape of line.
  // Engines per profile is the number that can: at 1.0 every car page said
  // something unique and the exercise bought nothing; the ten largest show where
  // the collapsing actually happened.
  private printFitment() {
    if (this.profiles.size === 0) return;

    const coverage = [...this.profiles.values()].sort((a, b) => b.engines.size - a.engines.size);
    const engines = coverage.reduce((total, profile) => total + profile.engines.size, 0);
    const perProfile = (engines / coverage.length).toFixed(1);

    console.log("");
    console.log(
      `  Fitment: ${engines} engine(s) across ${coverage.length} profile(s) — ${perProfile} engines per profile`,
    );
    console.log(`  Largest profiles by engine count:`);
    for (const profile of coverage.slice(0, MAX_PRINTED_PROFILES)) {
      console.log(`    ${String(profile.engines.size).padStart(4)} × ${profile.label}`);
    }
    if (coverage.length > MAX_PRINTED_PROFILES) {
      console.log(`    …and ${coverage.length - MAX_PRINTED_PROFILES} more profiles`);
    }

    if (this.orphanProfiles > 0) {
      console.log(
        `  ${this.orphanProfiles} imported profile(s) are attached to no engine — search "${IMPORT_HASH_NOTE_PREFIX}" in Fitment Profiles to review or delete them`,
      );
    }
  }
}

function printCounts(counts: Counts, indent: string) {
  let printed = false;
  for (const entity of ENTITIES) {
    const parts = ACTIONS.filter((action) => counts[entity][action] > 0).map(
      (action) => `${counts[entity][action]} ${action}`,
    );
    if (parts.length === 0) continue;
    console.log(`${indent}${entity.padEnd(16)} ${parts.join(", ")}`);
    printed = true;
  }
  if (!printed) console.log(`${indent}nothing to do`);
}

function printTally(tally: Map<string, number>, heading: string) {
  if (tally.size === 0) return;
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  console.log("");
  console.log(`  ${heading} (${rows.length}):`);
  for (const [wording, count] of rows.slice(0, MAX_PRINTED_NOTES)) {
    console.log(`    ${String(count).padStart(4)} × ${wording}`);
  }
  printOverflow(rows.length);
}

function printList(heading: string, lines: string[]) {
  if (lines.length === 0) return;
  console.log("");
  console.log(`  ${heading} (${lines.length}):`);
  for (const line of lines.slice(0, MAX_PRINTED_NOTES)) console.log(`    ${line}`);
  printOverflow(lines.length);
}

function printOverflow(total: number) {
  if (total > MAX_PRINTED_NOTES) console.log(`    …and ${total - MAX_PRINTED_NOTES} more`);
}

// ---------------------------------------------------------------------------
// Import context
// ---------------------------------------------------------------------------

type Ctx = {
  tx: Prisma.TransactionClient;
  source: string;
  report: ImportReport;
  counts: Counts;
  // Per file, because a dry run rolls each file back: an id cached across files
  // would point at a row that no longer exists.
  cache: {
    categoryIdBySlug: Map<string, string | null>;
    holdingCategoryId: string | null;
    brandIdByLabel: Map<string, string | null>;
    carBrandIdByName: Map<string, string | null>;
    // A car page names the same handful of popular oils over and over, and a
    // batch of car pages is one transaction — so this is the cache that saves
    // the most queries of any here.
    productIdBySourceRef: Map<string, string | null>;
    profileByHash: Map<string, { id: string; label: string }>;
  };
};

function newCache(): Ctx["cache"] {
  return {
    categoryIdBySlug: new Map(),
    holdingCategoryId: null,
    brandIdByLabel: new Map(),
    carBrandIdByName: new Map(),
    productIdBySourceRef: new Map(),
    profileByHash: new Map(),
  };
}

// Thrown to roll a dry run's transaction back. The alternative — a second code
// path that only pretends to write — would be the code path nobody tests, and
// it could not resolve a foreign key to a row the same run had just created.
class DryRunRollback extends Error {}

// Object keys sorted, array order kept. `Product.specs` is a jsonb column, and
// jsonb does not preserve key order: the spec badges read back in a different
// order than they were written, so a plain JSON.stringify comparison finds a
// difference on every run and re-updates a row nothing has changed about.
// Arrays are left alone — the order of oemPartNumbers is data.
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    );
  });
}

// Only the fields that differ, so an update that would change nothing isn't
// issued at all — which is what makes a second run report "unchanged" instead
// of rewriting every row's updatedAt.
function changedFields<T extends Record<string, unknown>>(current: T, desired: Partial<T>) {
  const changes: Partial<T> = {};
  for (const key of Object.keys(desired) as (keyof T)[]) {
    const before = current[key];
    const after = desired[key];
    const same =
      before === after ||
      (typeof before === "object" && before !== null && stableJson(before) === stableJson(after));
    if (!same) changes[key] = after;
  }
  return changes;
}

// Prisma writes SQL NULL into a Json column only through this sentinel — a
// plain null is a type error. It is applied at the write, not in the desired
// row above, so the diff can keep comparing `specs` as the plain value it reads
// back: comparing against the sentinel would report a change every run on every
// product whose specs are empty.
function jsonOrNull(value: unknown) {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

// A slug we derived can collide with a row we don't own — a hand-entered
// product that happens to sit at the same URL segment. Stealing it is not an
// option (it would rename someone's row or fail the unique constraint), so the
// second candidate is the hash, which nothing else can be holding.
async function resolveSlug(options: {
  sourceSlug: string | null;
  sourceRef: string;
  prefix: string;
  isTaken: (slug: string) => Promise<boolean>;
}): Promise<string | null> {
  const derived = deriveSlug(options);
  if (!(await options.isTaken(derived))) return derived;

  const fallback = fallbackSlug(options.prefix, options.sourceRef);
  if (fallback !== derived && !(await options.isTaken(fallback))) return fallback;

  return null;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// The five values `categoryGuess` can hold are our five category slugs, so this
// is a lookup, not a mapping. A guess pointing at a category this catalog
// doesn't have is a skip, not an invention.
async function findCategoryIdBySlug(ctx: Ctx, slug: string): Promise<string | null> {
  const cached = ctx.cache.categoryIdBySlug.get(slug);
  if (cached !== undefined) return cached;

  const category = await ctx.tx.category.findUnique({ where: { slug }, select: { id: true } });
  ctx.cache.categoryIdBySlug.set(slug, category?.id ?? null);
  return category?.id ?? null;
}

async function holdingCategoryId(ctx: Ctx): Promise<string> {
  if (ctx.cache.holdingCategoryId !== null) return ctx.cache.holdingCategoryId;

  const existing = await ctx.tx.category.findUnique({
    where: { slug: UNCATEGORISED_CATEGORY.slug },
    select: { id: true },
  });

  if (existing) {
    ctx.report.record(ctx.counts, "categories", "unchanged", UNCATEGORISED_CATEGORY.slug);
    ctx.cache.holdingCategoryId = existing.id;
    return existing.id;
  }

  const created = await ctx.tx.category.create({
    data: { ...UNCATEGORISED_CATEGORY, tags: [] },
    select: { id: true },
  });
  ctx.report.record(ctx.counts, "categories", "created", UNCATEGORISED_CATEGORY.slug);
  ctx.cache.holdingCategoryId = created.id;
  return created.id;
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

async function resolveBrandId(ctx: Ctx, brandLabelFa: string | null): Promise<string | null> {
  if (brandLabelFa === null) return unknownBrandId(ctx);

  const label = brandLabelFa.replace(/\s+/g, " ").trim();
  if (label === "") return unknownBrandId(ctx);

  const cached = ctx.cache.brandIdByLabel.get(label);
  if (cached !== undefined) return cached;

  const id = await upsertBrand(ctx, label);
  ctx.cache.brandIdByLabel.set(label, id);
  return id;
}

async function upsertBrand(ctx: Ctx, label: string): Promise<string | null> {
  const sourceRef = sourceRefFor(ctx.source, "brand", label);

  const owned = await ctx.tx.brand.findUnique({
    where: { sourceRef },
    select: { id: true, nameEn: true, nameFa: true },
  });

  if (owned) {
    // nameFa is the key this row was found by, so this only ever fires when a
    // previous run truncated differently — kept for the same reason every other
    // update path exists, not because it is expected to do anything.
    const desired = { nameEn: truncate(label, NAME_MAX), nameFa: truncate(label, NAME_MAX) };
    const changes = changedFields(owned, desired);
    if (Object.keys(changes).length === 0) {
      ctx.report.record(ctx.counts, "brands", "unchanged", sourceRef);
    } else {
      await ctx.tx.brand.update({ where: { id: owned.id }, data: changes });
      ctx.report.record(ctx.counts, "brands", "updated", sourceRef);
    }
    return owned.id;
  }

  // A hand-entered brand of the same Persian name is the same brand. Adopted —
  // linked to, never written to, not even to stamp our sourceRef on it — so a
  // catalog that already knows "شل" doesn't end up with two of it.
  const adopted = await ctx.tx.brand.findFirst({
    where: { nameFa: label },
    select: { id: true },
  });
  if (adopted) {
    ctx.report.record(ctx.counts, "brands", "unchanged", sourceRef);
    ctx.report.note(`brand "${label}": linked to an existing row, left untouched`);
    return adopted.id;
  }

  const slug = await resolveSlug({
    sourceSlug: label,
    sourceRef,
    prefix: "brand",
    isTaken: async (candidate) =>
      (await ctx.tx.brand.findUnique({ where: { slug: candidate }, select: { id: true } })) !==
      null,
  });
  if (slug === null) {
    ctx.report.record(ctx.counts, "brands", "skipped", sourceRef);
    ctx.report.note(`brand "${label}": no free slug, skipped`);
    return null;
  }

  const created = await ctx.tx.brand.create({
    data: {
      sourceRef,
      slug,
      nameEn: truncate(label, NAME_MAX),
      nameFa: truncate(label, NAME_MAX),
      status: "INACTIVE",
    },
    select: { id: true },
  });
  ctx.report.record(ctx.counts, "brands", "created", sourceRef);
  return created.id;
}

async function unknownBrandId(ctx: Ctx): Promise<string> {
  const cached = ctx.cache.brandIdByLabel.get(UNKNOWN_BRAND.slug);
  if (cached !== undefined && cached !== null) return cached;

  const existing = await ctx.tx.brand.findUnique({
    where: { slug: UNKNOWN_BRAND.slug },
    select: { id: true },
  });
  const id =
    existing?.id ??
    (await ctx.tx.brand.create({ data: { ...UNKNOWN_BRAND }, select: { id: true } })).id;

  ctx.report.record(ctx.counts, "brands", existing ? "unchanged" : "created", UNKNOWN_BRAND.slug);
  ctx.cache.brandIdByLabel.set(UNKNOWN_BRAND.slug, id);
  return id;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

async function importProduct(ctx: Ctx, product: ScrapeProduct) {
  const sourceRef = sourceRefFor(ctx.source, "product", product.sourceSlug);

  if (brandLabelDisagrees(product.nameFa, product.brandLabelFa)) {
    ctx.report.disagreement(product.nameFa ?? "", product.brandLabelFa ?? "", product.sourceUrl);
  }

  // The source's own decoded URL segment is readable Persian and is the only
  // other thing on the record that names it, so a nameless product is imported
  // under its key rather than dropped.
  const nameFa = truncate(product.nameFa ?? product.sourceSlug, NAME_MAX);
  const specs = parseProductSpecs(product.specs);

  // Tallied for every run, not only the run that creates the row: "which
  // categories does this source have that we don't" is a fact about the batch,
  // and a re-import whose summary quietly dropped it would read as though the
  // question had been answered.
  if (product.categoryGuess === null) {
    ctx.report.countUnmappedCategory(
      product.sourceCategoryText ?? "(no category text on the page)",
    );
  }

  const content = {
    nameEn: nameFa,
    nameFa,
    price: product.priceToman ?? 0,
    discountPercent: discountPercentFrom(product.priceToman, product.originalPriceToman),
    viscosity: specs.viscosity,
    apiGrade: specs.apiGrade,
    volumeMl: specs.volumeMl,
    // The badges verbatim, whether or not the three columns above understood
    // them — what wasn't parsed is still worth having on the row.
    specs: Object.keys(product.specs).length > 0 ? product.specs : null,
    oemPartNumbers: product.oemPartNumbers,
    shortDescriptionFa: truncate(product.shortDescriptionFa ?? "", SHORT_DESCRIPTION_MAX),
    shortDescriptionEn: "",
    longDescriptionFa: truncate(product.longDescriptionFa ?? "", LONG_DESCRIPTION_MAX),
    longDescriptionEn: "",
  };

  if (product.priceToman === null) {
    ctx.report.note(`product "${nameFa}": no price on the page, imported at 0`);
  }

  const existing = await ctx.tx.product.findUnique({
    where: { sourceRef },
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      price: true,
      discountPercent: true,
      viscosity: true,
      apiGrade: true,
      volumeMl: true,
      specs: true,
      oemPartNumbers: true,
      shortDescriptionFa: true,
      shortDescriptionEn: true,
      longDescriptionFa: true,
      longDescriptionEn: true,
      categoryId: true,
      brandId: true,
    },
  });

  if (existing) {
    await updateProduct(ctx, product, existing, content, sourceRef);
    return;
  }

  const categoryId = await resolveCategoryIdForProduct(ctx, product);
  if (categoryId === null) {
    ctx.report.record(ctx.counts, "products", "skipped", sourceRef);
    ctx.report.note(
      `product "${nameFa}": category "${product.categoryGuess}" is not in this catalog, skipped`,
    );
    return;
  }

  const brandId = await resolveBrandId(ctx, product.brandLabelFa);
  if (brandId === null) {
    ctx.report.record(ctx.counts, "products", "skipped", sourceRef);
    ctx.report.note(`product "${nameFa}": its brand could not be created, skipped`);
    return;
  }

  const slug = await resolveSlug({
    sourceSlug: product.sourceSlug,
    sourceRef,
    prefix: "product",
    isTaken: async (candidate) =>
      (await ctx.tx.product.findUnique({ where: { slug: candidate }, select: { id: true } })) !==
      null,
  });
  if (slug === null) {
    ctx.report.record(ctx.counts, "products", "skipped", sourceRef);
    ctx.report.note(`product "${nameFa}": no free slug, skipped`);
    return;
  }

  const created = await ctx.tx.product.create({
    data: {
      ...content,
      specs: jsonOrNull(content.specs),
      sourceRef,
      slug,
      sku: deriveSku(ctx.source, sourceRef),
      categoryId,
      brandId,
      status: "INACTIVE",
    },
    select: { id: true },
  });
  ctx.report.record(ctx.counts, "products", "created", sourceRef);
  await ensureInventory(ctx, created.id, sourceRef);
}

type ExistingProduct = {
  id: string;
  price: Prisma.Decimal;
  categoryId: string;
  brandId: string;
} & Record<string, unknown>;

async function updateProduct(
  ctx: Ctx,
  product: ScrapeProduct,
  existing: ExistingProduct,
  content: Record<string, unknown>,
  sourceRef: string,
) {
  const desired: Record<string, unknown> = { ...content };

  // A null guess means the source told us nothing, so the row keeps whichever
  // category it has — including the one an admin moved it to after finding it
  // in the holding shelf. Re-filing it back every run would make the review
  // work D.4 exists for pointless.
  if (product.categoryGuess !== null) {
    const categoryId = await findCategoryIdBySlug(ctx, product.categoryGuess);
    if (categoryId !== null) desired.categoryId = categoryId;
  }

  // Same shape of rule for the brand: a printed label is the source asserting
  // something and wins, a missing one leaves the row's brand alone.
  if (product.brandLabelFa !== null) {
    const brandId = await resolveBrandId(ctx, product.brandLabelFa);
    if (brandId !== null) desired.brandId = brandId;
  }

  const current = { ...existing, price: Number(existing.price) };
  const changes = changedFields(current, desired);

  if (Object.keys(changes).length === 0) {
    ctx.report.record(ctx.counts, "products", "unchanged", sourceRef);
  } else {
    const data = "specs" in changes ? { ...changes, specs: jsonOrNull(changes.specs) } : changes;
    await ctx.tx.product.update({ where: { id: existing.id }, data });
    ctx.report.record(ctx.counts, "products", "updated", sourceRef);
  }

  await ensureInventory(ctx, existing.id, sourceRef);
}

// Every product needs an Inventory row, and the source has no count to put in
// it — "موجود در انبار" is a claim about their warehouse, not ours. So it is
// created at zero and never touched again: whatever someone counts into it
// survives every later run.
async function ensureInventory(ctx: Ctx, productId: string, sourceRef: string) {
  const existing = await ctx.tx.inventory.findUnique({
    where: { productId },
    select: { id: true },
  });

  if (existing) {
    ctx.report.record(ctx.counts, "inventory", "unchanged", `${sourceRef}#inventory`);
    return;
  }

  await ctx.tx.inventory.create({ data: { productId, stock: 0, lastUpdatedAt: new Date() } });
  ctx.report.record(ctx.counts, "inventory", "created", `${sourceRef}#inventory`);
}

async function resolveCategoryIdForProduct(
  ctx: Ctx,
  product: ScrapeProduct,
): Promise<string | null> {
  if (product.categoryGuess !== null) return findCategoryIdBySlug(ctx, product.categoryGuess);
  return holdingCategoryId(ctx);
}

// How a car page's section finds the product it links to. Only rows the importer
// created can be found this way, which is the intended reach: a car page cannot
// attach a hand-entered product to a fitment profile by accident, and a product
// the source links to but this catalog doesn't stock is a null, not a failure.
async function findProductIdBySourceRef(ctx: Ctx, sourceRef: string): Promise<string | null> {
  const cached = ctx.cache.productIdBySourceRef.get(sourceRef);
  if (cached !== undefined) return cached;

  const product = await ctx.tx.product.findUnique({ where: { sourceRef }, select: { id: true } });
  ctx.cache.productIdBySourceRef.set(sourceRef, product?.id ?? null);
  return product?.id ?? null;
}

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------

async function importCar(ctx: Ctx, car: ScrapeCar) {
  const carBrandId = await resolveCarBrandId(ctx, car);
  if (carBrandId === null) return;

  // The engine has no sourceRef of its own, so the model's stands in for it
  // wherever one is needed — reporting included.
  const modelRef = sourceRefFor(ctx.source, "car-model", car.brandNameFa, car.modelNameFa);
  const model = await upsertCarModel(ctx, car, carBrandId, modelRef);
  if (model === null) return;

  // An adopted model is a hand-entered car: it has its own engines, entered by
  // someone who knew the years and the fuel type, and a synthesised 2000-onward
  // engine next to them would be noise at best. Its fitment is left alone for
  // the same reason — attaching an imported profile to an engine somebody
  // curated is exactly the overwrite this importer refuses to do.
  if (!model.owned) {
    ctx.report.record(ctx.counts, "carEngines", "skipped", `${modelRef}#engine`);
    ctx.report.note(`car "${car.modelNameFa}": existing model adopted, its engines left alone`);
    skipFitment(ctx, car, modelRef);
    return;
  }

  const carEngineId = await upsertCarEngine(ctx, car, model.id, modelRef);
  // No engine means nothing to hang a recommendation on. Why is already in the
  // report — `upsertCarEngine` said so on its way out.
  if (carEngineId === null) {
    skipFitment(ctx, car, modelRef);
    return;
  }

  await importCarFitment(ctx, car, carEngineId, modelRef);
}

// Counted, not just noted, so a file's own numbers add up: 40 cars in, 38
// profiles and 2 skipped.
function skipFitment(ctx: Ctx, car: ScrapeCar, modelRef: string) {
  if (car.sections.length === 0) return;
  ctx.report.record(ctx.counts, "fitmentProfiles", "skipped", `${modelRef}#fitment`);
}

async function resolveCarBrandId(ctx: Ctx, car: ScrapeCar): Promise<string | null> {
  const name = car.brandNameFa.replace(/\s+/g, " ").trim();
  const cached = ctx.cache.carBrandIdByName.get(name);
  if (cached !== undefined) return cached;

  const id = await upsertCarBrand(ctx, car, name);
  ctx.cache.carBrandIdByName.set(name, id);
  return id;
}

async function upsertCarBrand(ctx: Ctx, car: ScrapeCar, name: string): Promise<string | null> {
  const sourceRef = sourceRefFor(ctx.source, "car-brand", name);

  // Nothing to diff: the brand's name *is* the key it was found by, so a row we
  // own is by definition already what this batch says it should be.
  const owned = await ctx.tx.carBrand.findUnique({
    where: { sourceRef },
    select: { id: true },
  });
  if (owned) {
    ctx.report.record(ctx.counts, "carBrands", "unchanged", sourceRef);
    return owned.id;
  }

  const adopted = await ctx.tx.carBrand.findFirst({
    where: { nameFa: name },
    select: { id: true },
  });
  if (adopted) {
    ctx.report.record(ctx.counts, "carBrands", "unchanged", sourceRef);
    ctx.report.note(`car brand "${name}": linked to an existing row, left untouched`);
    return adopted.id;
  }

  const slug = await resolveSlug({
    sourceSlug: car.brandSourceSlug,
    sourceRef,
    prefix: "car-brand",
    isTaken: async (candidate) =>
      (await ctx.tx.carBrand.findUnique({ where: { slug: candidate }, select: { id: true } })) !==
      null,
  });
  if (slug === null) {
    ctx.report.record(ctx.counts, "carBrands", "skipped", sourceRef);
    ctx.report.note(`car brand "${name}": no free slug, skipped`);
    return null;
  }

  const created = await ctx.tx.carBrand.create({
    data: {
      sourceRef,
      slug,
      nameEn: truncate(name, NAME_MAX),
      nameFa: truncate(name, NAME_MAX),
      status: "INACTIVE",
    },
    select: { id: true },
  });
  ctx.report.record(ctx.counts, "carBrands", "created", sourceRef);
  return created.id;
}

async function upsertCarModel(
  ctx: Ctx,
  car: ScrapeCar,
  carBrandId: string,
  sourceRef: string,
): Promise<{ id: string; owned: boolean } | null> {
  const name = truncate(car.modelNameFa.replace(/\s+/g, " ").trim(), NAME_MAX);

  const owned = await ctx.tx.carModel.findUnique({
    where: { sourceRef },
    select: { id: true, nameEn: true, nameFa: true },
  });
  if (owned) {
    const changes = changedFields(owned, { nameEn: name, nameFa: name });
    if (Object.keys(changes).length === 0) {
      ctx.report.record(ctx.counts, "carModels", "unchanged", sourceRef);
    } else {
      await ctx.tx.carModel.update({ where: { id: owned.id }, data: changes });
      ctx.report.record(ctx.counts, "carModels", "updated", sourceRef);
    }
    return { id: owned.id, owned: true };
  }

  const adopted = await ctx.tx.carModel.findFirst({
    where: { carBrandId, nameFa: name },
    select: { id: true },
  });
  if (adopted) {
    ctx.report.record(ctx.counts, "carModels", "unchanged", sourceRef);
    ctx.report.note(`car "${name}": linked to an existing model, left untouched`);
    return { id: adopted.id, owned: false };
  }

  const slug = await resolveSlug({
    sourceSlug: car.modelSourceSlug,
    sourceRef,
    prefix: "car-model",
    // Model slugs are unique per brand, not globally — two brands may both have
    // a "1500".
    isTaken: async (candidate) =>
      (await ctx.tx.carModel.findFirst({
        where: { carBrandId, slug: candidate },
        select: { id: true },
      })) !== null,
  });
  if (slug === null) {
    ctx.report.record(ctx.counts, "carModels", "skipped", sourceRef);
    ctx.report.note(`car "${name}": no free slug, skipped`);
    return null;
  }

  const created = await ctx.tx.carModel.create({
    data: { sourceRef, carBrandId, slug, nameEn: name, nameFa: name, status: "INACTIVE" },
    select: { id: true },
  });
  ctx.report.record(ctx.counts, "carModels", "created", sourceRef);
  return { id: created.id, owned: true };
}

// One synthesised engine per imported model (mismatch 3.1: the source has no
// engines and no years). It has no sourceRef of its own — CarEngine never got
// one — so it is identified as "the only engine of a model we own". A model
// that has grown a second engine has been worked on by hand, and the importer
// stops touching its engines rather than guessing which one is its own.
//
// Returns the engine the car's fitment profile should attach to, or null where
// there is none to attach to — both of the cases below that decline to write an
// engine also decline to guess which existing engine the page is about.
async function upsertCarEngine(
  ctx: Ctx,
  car: ScrapeCar,
  carModelId: string,
  modelRef: string,
): Promise<string | null> {
  const fuel = mapFuelType(car.modelDescriptorText, car.modelNameFa);
  if (fuel === null) {
    ctx.report.countUnmappedFuelWording(car.modelDescriptorText ?? car.modelNameFa);
    ctx.report.record(ctx.counts, "carEngines", "skipped", `${modelRef}#engine`);
    ctx.report.note(`car "${car.modelNameFa}": no fuel type in the source wording, no engine`);
    return null;
  }

  const labelFa = truncate(car.modelDescriptorText ?? car.modelNameFa, ENGINE_LABEL_MAX);
  const engines = await ctx.tx.carEngine.findMany({
    where: { carModelId },
    select: { id: true, labelEn: true, labelFa: true, fuelType: true },
  });

  if (engines.length > 1) {
    ctx.report.record(ctx.counts, "carEngines", "skipped", `${modelRef}#engine`);
    ctx.report.note(`car "${car.modelNameFa}": ${engines.length} engines already, left alone`);
    return null;
  }

  const desired = { labelEn: labelFa, labelFa, fuelType: fuel.fuelType };

  if (engines.length === 1) {
    const changes = changedFields(engines[0], desired);
    if (Object.keys(changes).length === 0) {
      ctx.report.record(ctx.counts, "carEngines", "unchanged", `${modelRef}#engine`);
    } else {
      await ctx.tx.carEngine.update({ where: { id: engines[0].id }, data: changes });
      ctx.report.record(ctx.counts, "carEngines", "updated", `${modelRef}#engine`);
    }
    return engines[0].id;
  }

  const created = await ctx.tx.carEngine.create({
    data: {
      ...desired,
      carModelId,
      // Written once, never updated: narrowing this by hand is the point of
      // DECISION 1, and a re-run that widened it again would undo that work.
      yearStart: IMPORTED_YEAR_START,
      yearEnd: null,
      status: "INACTIVE",
    },
    select: { id: true },
  });
  ctx.report.record(ctx.counts, "carEngines", "created", `${modelRef}#engine`);
  return created.id;
}

// ---------------------------------------------------------------------------
// Fitment
// ---------------------------------------------------------------------------
//
// The point of the whole phase. A car page's sections are normalised into a
// canonical item list (lib/import.ts), and that list's hash *is* the profile's
// identity: the first car to produce a given hash creates the profile and names
// it, every later car sharing it just links its engine. oil-city.ir gives whole
// families of models the same recommendation, so ~800 model pages collapse into
// far fewer profiles — which is what makes the imported data maintainable, since
// correcting one profile afterwards corrects every car that shares it.

// A canonical row plus the two things only this catalog can answer: which
// category row it belongs to, and whether we actually stock the product.
type ResolvedFitmentRow = {
  sectionIndex: number;
  categoryId: string;
  productId: string | null;
  specNote: string | null;
  priority: number;
  canonical: CanonicalFitmentRow;
};

async function importCarFitment(ctx: Ctx, car: ScrapeCar, carEngineId: string, modelRef: string) {
  const rows = await resolveFitmentRows(ctx, car);
  if (rows.length === 0) {
    skipFitment(ctx, car, modelRef);
    return;
  }

  const hash = fitmentHash(rows.map((row) => row.canonical));
  const sections = new Set(rows.map((row) => row.sectionIndex)).size;
  const profile = await ensureFitmentProfile(ctx, hash, fitmentProfileLabel(car, sections), rows);

  // Counted against the profile's *stored* label, not the one this car would
  // have given it — a profile minted by another car keeps that car's name, and
  // the summary has to match what an admin will find in the profile list.
  ctx.report.coverProfile(hash, profile.label, modelRef);
  await linkEngineToProfile(ctx, car, carEngineId, profile.id, modelRef);
}

async function resolveFitmentRows(ctx: Ctx, car: ScrapeCar): Promise<ResolvedFitmentRow[]> {
  const rows: ResolvedFitmentRow[] = [];

  for (const candidate of fitmentCandidatesFor(car)) {
    const categoryId = await resolveFitmentCategoryId(ctx, candidate.categoryGuess);
    if (categoryId === null) {
      ctx.report.note(
        `car "${car.modelNameFa}": section category "${candidate.categoryGuess}" is not in this catalog, item skipped`,
      );
      continue;
    }
    if (candidate.categoryGuess === null) {
      ctx.report.countUnmappedSection(candidate.headingFa ?? "(section with no heading)");
    }

    // A section links to a product page; `Product.sourceRef` is built from that
    // URL's decoded last segment. Not stocking it is not a problem — the item
    // becomes spec-only and the summary names it, so the gaps in the catalog are
    // a list somebody can work rather than a silent absence.
    const productSourceRef =
      candidate.productSourceSlug === null
        ? null
        : sourceRefFor(ctx.source, "product", candidate.productSourceSlug);
    const productId =
      productSourceRef === null ? null : await findProductIdBySourceRef(ctx, productSourceRef);
    const matched =
      productId !== null ||
      (productSourceRef !== null && ctx.report.dryRunImportedProduct(productSourceRef));
    if (productSourceRef !== null && !matched) {
      ctx.report.countMissingSectionProduct(
        candidate.productNameFa ?? candidate.productSourceSlug ?? "(unnamed)",
      );
    }

    const specNote = fitmentSpecNote(candidate, matched);
    // Neither a product nor a word about what the car needs is not a
    // recommendation. fitmentProfileItemCreateSchema refuses one from the admin
    // form; the importer doesn't get to write one either. Keyed on `matched`
    // rather than on the id, so a dry run drops the same items the real run will
    // — the row it writes and rolls back is the one thing here allowed to be
    // emptier than its real counterpart.
    if (!matched && specNote === null) continue;

    rows.push({
      sectionIndex: candidate.sectionIndex,
      categoryId,
      productId,
      specNote,
      priority: candidate.priority,
      canonical: {
        categorySlug: candidate.categoryGuess ?? UNCATEGORISED_CATEGORY.slug,
        // The *resolved* ref: an item we couldn't match is a spec-only item, and
        // has to hash as one.
        productSourceRef: matched ? productSourceRef : null,
        specNote,
        priority: candidate.priority,
      },
    });
  }

  return rows;
}

// The same holding-shelf answer DECISION 2 gives a product whose category this
// catalog doesn't have. A car page's coolant, ATF and brake-fluid sections are
// real recommendations — dropping them would throw away a third of what these
// pages say — so they land in the same INACTIVE holding category their products
// landed in, and the summary tallies the source's own headings so the real
// categories can be created by hand later with the counts in view.
async function resolveFitmentCategoryId(
  ctx: Ctx,
  categoryGuess: string | null,
): Promise<string | null> {
  if (categoryGuess === null) return holdingCategoryId(ctx);
  return findCategoryIdBySlug(ctx, categoryGuess);
}

// Created once per distinct hash, then never written to again. A profile found
// by its hash already says what this car's page says — that is what the hash
// means — and an admin may since have improved its items; rewriting them every
// run would undo exactly the review work D.4 exists for.
async function ensureFitmentProfile(
  ctx: Ctx,
  hash: string,
  label: string,
  rows: ResolvedFitmentRow[],
): Promise<{ id: string; label: string }> {
  const cached = ctx.cache.profileByHash.get(hash);
  if (cached !== undefined) {
    ctx.report.record(ctx.counts, "fitmentProfiles", "unchanged", importHashNote(hash));
    return cached;
  }

  const internalNote = importHashNote(hash);
  const existing = await ctx.tx.fitmentProfile.findFirst({
    where: { internalNote },
    select: { id: true, label: true },
  });

  if (existing) {
    ctx.report.record(ctx.counts, "fitmentProfiles", "unchanged", internalNote);
    ctx.cache.profileByHash.set(hash, existing);
    return existing;
  }

  const created = await ctx.tx.fitmentProfile.create({
    data: { label, internalNote },
    select: { id: true, label: true },
  });

  await ctx.tx.fitmentProfileItem.createMany({
    data: rows.map((row) => ({
      profileId: created.id,
      categoryId: row.categoryId,
      productId: row.productId,
      specNote: row.specNote,
      // Mismatch 3.5: the source's oil notes say the recommendation holds
      // "در هر چهار فصل". There is no climate split to import, and HOT/COLD
      // stays a manual enrichment.
      climate: "STANDARD" as const,
      priority: row.priority,
    })),
  });

  ctx.report.record(ctx.counts, "fitmentProfiles", "created", internalNote);
  ctx.report.recordMany(ctx.counts, "fitmentItems", "created", rows.length);
  ctx.cache.profileByHash.set(hash, created);
  return created;
}

async function linkEngineToProfile(
  ctx: Ctx,
  car: ScrapeCar,
  carEngineId: string,
  profileId: string,
  modelRef: string,
) {
  const links = await ctx.tx.carEngineFitmentProfile.findMany({
    where: { carEngineId },
    select: { id: true, profileId: true, profile: { select: { label: true, internalNote: true } } },
  });

  // A car page that changed since the last run hashes differently and so
  // resolves to a different profile. Adding the new link without dropping the
  // old one would leave the engine resolving to both at once — two answers where
  // the page gives one. Only the importer's own links are dropped: a profile an
  // admin attached by hand carries no import hash and stays where they put it.
  for (const link of links) {
    if (link.profileId === profileId) continue;
    if (!isImportHashNote(link.profile.internalNote)) continue;

    await ctx.tx.carEngineFitmentProfile.delete({ where: { id: link.id } });
    ctx.report.note(
      `car "${car.modelNameFa}": detached from "${link.profile.label}" — its page now says something else`,
    );
  }

  if (links.some((link) => link.profileId === profileId)) {
    ctx.report.record(ctx.counts, "fitmentLinks", "unchanged", `${modelRef}#fitment-link`);
    return;
  }

  await ctx.tx.carEngineFitmentProfile.create({ data: { carEngineId, profileId } });
  ctx.report.record(ctx.counts, "fitmentLinks", "created", `${modelRef}#fitment-link`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function runBatch(options: Options, report: ImportReport, file: string, batch: ScrapeBatch) {
  const counts = report.startFile(file, batch);

  try {
    await prisma.$transaction(
      async (tx) => {
        const ctx: Ctx = {
          tx,
          source: options.source,
          report,
          counts,
          cache: newCache(),
        };

        for (const product of batch.products) await importProduct(ctx, product);
        for (const car of batch.cars) await importCar(ctx, car);

        if (options.dryRun) throw new DryRunRollback();
      },
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
  } catch (error) {
    if (error instanceof DryRunRollback) return;
    report.fileFailed(file, error instanceof Error ? error.message : String(error));
  }
}

// A car page that changes what it says leaves its old profile behind, attached
// to nothing (`linkEngineToProfile` moves the engine but deletes no profile —
// an admin may have improved that profile's items, and this importer doesn't
// destroy work it can't see). Nothing else would ever mention them, so the debris
// the importer creates is the debris it reports.
//
// Read after the run rather than tracked during it: a profile is only orphaned
// once every file has had its say. Skipped for a dry run, where the answer would
// describe a database state the run deliberately didn't produce.
async function countOrphanProfiles(options: Options, report: ImportReport) {
  if (options.dryRun) return;

  report.orphanProfiles = await prisma.fitmentProfile.count({
    where: {
      internalNote: { startsWith: IMPORT_HASH_NOTE_PREFIX },
      carEngineLinks: { none: {} },
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = path.resolve(__dirname, "..", "scrape", options.source);
  const files = listBatchFiles(dir);

  console.log(
    `Importing source "${options.source}" from ${dir} — ${files.length} batch file(s)${
      options.dryRun ? " — DRY RUN, nothing will be written" : ""
    }`,
  );

  const report = new ImportReport(options);

  for (const file of files) {
    const parsed = parseScrapeBatchJson(file, readFileSync(path.join(dir, file), "utf8"));
    if (!parsed.success) {
      report.invalidFile(file, parsed.errors);
      continue;
    }
    await runBatch(options, report, file, parsed.data);
  }

  await countOrphanProfiles(options, report);
  report.print();
  if (report.failed) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
