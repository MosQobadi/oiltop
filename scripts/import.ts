// Catalog importer. Reads every batch file for a source, validates each with
// D.1's schema, and upserts in dependency order:
//
//   Category (holding) -> Brand -> Product (+Inventory) -> CarBrand -> CarModel -> CarEngine
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
  deriveSku,
  deriveSlug,
  discountPercentFrom,
  ENGINE_LABEL_MAX,
  fallbackSlug,
  IMPORTED_YEAR_START,
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

class ImportReport {
  readonly files: FileReport[] = [];
  readonly invalidFiles: { file: string; errors: string[] }[] = [];
  readonly unmappedCategories = new Map<string, number>();
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

  note(message: string) {
    this.notes.push(message);
  }

  countUnmappedCategory(wording: string) {
    this.unmappedCategories.set(wording, (this.unmappedCategories.get(wording) ?? 0) + 1);
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

    printTally(
      this.unmappedCategories,
      `Source categories with no match here — imported into "${UNCATEGORISED_CATEGORY.slug}", INACTIVE`,
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
}

function printCounts(counts: Counts, indent: string) {
  let printed = false;
  for (const entity of ENTITIES) {
    const parts = ACTIONS.filter((action) => counts[entity][action] > 0).map(
      (action) => `${counts[entity][action]} ${action}`,
    );
    if (parts.length === 0) continue;
    console.log(`${indent}${entity.padEnd(11)} ${parts.join(", ")}`);
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
  };
};

function newCache(): Ctx["cache"] {
  return {
    categoryIdBySlug: new Map(),
    holdingCategoryId: null,
    brandIdByLabel: new Map(),
    carBrandIdByName: new Map(),
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
  // engine next to them would be noise at best.
  if (!model.owned) {
    ctx.report.record(ctx.counts, "carEngines", "skipped", `${modelRef}#engine`);
    ctx.report.note(`car "${car.modelNameFa}": existing model adopted, its engines left alone`);
    return;
  }

  await upsertCarEngine(ctx, car, model.id, modelRef);
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
async function upsertCarEngine(ctx: Ctx, car: ScrapeCar, carModelId: string, modelRef: string) {
  const fuel = mapFuelType(car.modelDescriptorText, car.modelNameFa);
  if (fuel === null) {
    ctx.report.countUnmappedFuelWording(car.modelDescriptorText ?? car.modelNameFa);
    ctx.report.record(ctx.counts, "carEngines", "skipped", `${modelRef}#engine`);
    ctx.report.note(`car "${car.modelNameFa}": no fuel type in the source wording, no engine`);
    return;
  }

  const labelFa = truncate(car.modelDescriptorText ?? car.modelNameFa, ENGINE_LABEL_MAX);
  const engines = await ctx.tx.carEngine.findMany({
    where: { carModelId },
    select: { id: true, labelEn: true, labelFa: true, fuelType: true },
  });

  if (engines.length > 1) {
    ctx.report.record(ctx.counts, "carEngines", "skipped", `${modelRef}#engine`);
    ctx.report.note(`car "${car.modelNameFa}": ${engines.length} engines already, left alone`);
    return;
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
    return;
  }

  await ctx.tx.carEngine.create({
    data: {
      ...desired,
      carModelId,
      // Written once, never updated: narrowing this by hand is the point of
      // DECISION 1, and a re-run that widened it again would undo that work.
      yearStart: IMPORTED_YEAR_START,
      yearEnd: null,
      status: "INACTIVE",
    },
  });
  ctx.report.record(ctx.counts, "carEngines", "created", `${modelRef}#engine`);
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

  report.print();
  if (report.failed) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
