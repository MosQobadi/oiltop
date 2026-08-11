import { deriveStorefrontStockStatus, type StorefrontStockStatus } from "./catalog";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

// Shared fitment resolution — the Brand → Model → Year → Engine walk plus the
// CarEngine → CarEngineFitmentProfile → FitmentProfile → FitmentProfileItem
// lookup behind it. Both the admin Fitment Preview route and the public
// storefront car-finder routes call in here so the two surfaces can never
// drift apart on what a given engine resolves to. Their one deliberate
// difference is how a deactivated product is treated — see `FitmentAudience`.
//
// Nothing here is auth-aware: it deliberately returns no admin-only fields
// (FitmentProfile.internalNote, FitmentProfileItem.adminNote), so the same
// payload is safe to serve unauthenticated.

export type FitmentClimate = "STANDARD" | "HOT" | "COLD";

// English-only, and only meaningful for the non-STANDARD climates — this is the
// admin Fitment Preview's chip text. The bilingual storefront localizes off the
// `climate` enum instead of rendering this string.
const CLIMATE_LABELS: Record<FitmentClimate, string | null> = {
  STANDARD: null,
  HOT: "Hot climate",
  COLD: "Cold climate",
};

// Everything components/storefront/ProductCard needs, so a fitment result is a
// normal product tile rather than a second kind of card — hence the slug (its
// PDP link) and the stock status, which are otherwise catalog concerns.
export interface FitmentProductSummary {
  id: string;
  slug: string;
  nameEn: string;
  nameFa: string;
  price: number;
  finalPrice: number;
  image: string | null;
  stockStatus: StorefrontStockStatus | null;
}

export interface FitmentResolvedItem {
  id: string;
  climate: FitmentClimate;
  climateLabel: string | null;
  priority: number;
  // Zero, one or several. Empty means a spec-only recommendation: we know what
  // the car needs, the catalog just doesn't carry a matching product yet. A
  // `matchSpec` item is the reason this is a list rather than one nullable
  // product — "5W-30, API SN" legitimately resolves to every 5W-30 in stock.
  products: FitmentProductSummary[];
  specNote: string | null;
  specAttributes: Prisma.JsonValue | null;
}

export interface FitmentCategoryGroup {
  category: FitmentCategorySummary;
  items: FitmentResolvedItem[];
}

// Shared by the item's explicitly linked product and by the rows a `matchSpec`
// finds, so both arrive as the same `FitmentProductSummary` through
// `toProductSummary`. Scoped narrower than server/fitmentProfile.ts's admin
// include: no adminNote, and the bilingual name pairs the storefront needs.
const fitmentProductSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  price: true,
  discountPercent: true,
  image: true,
  inventory: { select: { stock: true } },
  // Read to decide whether a customer may see this item's product at all
  // (see `isPubliclyVisible`), never published — `toProductSummary` builds
  // `FitmentProductSummary` field by field and none of these are in it.
  status: true,
  category: { select: { status: true } },
  brand: { select: { status: true } },
} satisfies Prisma.ProductSelect;

const fitmentItemInclude = {
  category: {
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      partType: true,
      filterKind: true,
    },
  },
  product: { select: fitmentProductSelect },
} satisfies Prisma.FitmentProfileItemInclude;

export type FitmentItemWithRelations = Prisma.FitmentProfileItemGetPayload<{
  include: typeof fitmentItemInclude;
}>;

export type FitmentProductRow = Prisma.ProductGetPayload<{
  select: typeof fitmentProductSelect;
}>;

export type FitmentCategorySummary = FitmentItemWithRelations["category"];

// The four selects below are what the public car-finder is allowed to see. They
// are deliberately narrow: the wizard only needs enough to render a picker, and
// keeping the projection here (rather than mapping in each route handler) means
// a new column on any of these models isn't published by accident.
const carBrandSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  logo: true,
} satisfies Prisma.CarBrandSelect;

const carModelSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameFa: true,
  image: true,
} satisfies Prisma.CarModelSelect;

const carEngineSelect = {
  id: true,
  labelEn: true,
  labelFa: true,
  yearStart: true,
  yearEnd: true,
  fuelType: true,
  displacementCc: true,
  engineCode: true,
} satisfies Prisma.CarEngineSelect;

export type CarBrandOption = Prisma.CarBrandGetPayload<{
  select: typeof carBrandSelect;
}>;
export type CarModelOption = Prisma.CarModelGetPayload<{
  select: typeof carModelSelect;
}>;
export type CarEngineOption = Prisma.CarEngineGetPayload<{
  select: typeof carEngineSelect;
}>;

// A car-finder breadcrumb: "Peugeot › 206 › 1.4L TU3 Petrol".
export interface CarEngineContext {
  carEngine: CarEngineOption;
  carModel: CarModelOption;
  carBrand: CarBrandOption;
}

export async function getActiveCarBrands(): Promise<CarBrandOption[]> {
  return prisma.carBrand.findMany({
    where: { status: "ACTIVE" },
    select: carBrandSelect,
    orderBy: { nameEn: "asc" },
  });
}

export async function getActiveCarBrandBySlug(slug: string): Promise<CarBrandOption | null> {
  return prisma.carBrand.findFirst({
    where: { slug, status: "ACTIVE" },
    select: carBrandSelect,
  });
}

// Deactivating a car brand has to hide its models too, so every lookup below
// walks up the chain and requires the whole brand → model → engine path to be
// ACTIVE — not just the row being asked for.
export async function getActiveCarModelById(carModelId: string): Promise<CarModelOption | null> {
  return prisma.carModel.findFirst({
    where: {
      id: carModelId,
      status: "ACTIVE",
      carBrand: { status: "ACTIVE" },
    },
    select: carModelSelect,
  });
}

export async function getActiveCarEngineContext(
  carEngineId: string,
): Promise<CarEngineContext | null> {
  const carEngine = await prisma.carEngine.findFirst({
    where: {
      id: carEngineId,
      status: "ACTIVE",
      carModel: { status: "ACTIVE", carBrand: { status: "ACTIVE" } },
    },
    select: {
      ...carEngineSelect,
      carModel: {
        select: { ...carModelSelect, carBrand: { select: carBrandSelect } },
      },
    },
  });
  if (!carEngine) return null;

  const { carModel, ...engine } = carEngine;
  const { carBrand, ...model } = carModel;
  return { carEngine: engine, carModel: model, carBrand };
}

export async function getCarModelsForBrand(carBrandId: string): Promise<CarModelOption[]> {
  return prisma.carModel.findMany({
    where: { carBrandId, status: "ACTIVE" },
    select: carModelSelect,
    orderBy: { nameEn: "asc" },
  });
}

// A model's selectable years are derived from its engines' ranges — there is no
// per-year row in the schema. A null yearEnd means "still in production", which
// expands up to the current year.
export function expandYearRanges(
  ranges: { yearStart: number; yearEnd: number | null }[],
  currentYear: number = new Date().getFullYear(),
): number[] {
  const years = new Set<number>();
  for (const range of ranges) {
    const end = range.yearEnd ?? currentYear;
    for (let year = range.yearStart; year <= end; year++) years.add(year);
  }
  // Newest first — customers pick recent model years far more often.
  return Array.from(years).sort((a, b) => b - a);
}

export async function getYearOptionsForModel(carModelId: string) {
  const engines = await prisma.carEngine.findMany({
    where: { carModelId, status: "ACTIVE" },
    select: { yearStart: true, yearEnd: true },
  });
  return expandYearRanges(engines);
}

export async function getEnginesForModelYear(
  carModelId: string,
  year: number,
): Promise<CarEngineOption[]> {
  return prisma.carEngine.findMany({
    where: {
      carModelId,
      status: "ACTIVE",
      yearStart: { lte: year },
      OR: [{ yearEnd: null }, { yearEnd: { gte: year } }],
    },
    select: carEngineSelect,
    orderBy: [{ yearStart: "asc" }, { labelEn: "asc" }],
  });
}

// Who the resolution is being rendered for. The two surfaces want different
// answers about a deactivated product: a customer must not be recommended one,
// while the admin Fitment Preview is the QA tool for exactly this data and has
// to keep showing that the profile still points at it.
export type FitmentAudience = "public" | "admin";

// The same chain catalog.ts enforces on every public product read: a product is
// purchasable only if its own row, its category and its brand are all ACTIVE.
function isPubliclyVisible(product: NonNullable<FitmentItemWithRelations["product"]>): boolean {
  return (
    product.status === "ACTIVE" &&
    product.category.status === "ACTIVE" &&
    product.brand.status === "ACTIVE"
  );
}

function toProductSummary(product: FitmentProductRow): FitmentProductSummary {
  const price = Number(product.price);

  return {
    id: product.id,
    slug: product.slug,
    nameEn: product.nameEn,
    nameFa: product.nameFa,
    price,
    // finalPrice isn't stored — same read-time computation as
    // server/product.ts, kept in sync with it deliberately.
    finalPrice: price * (1 - product.discountPercent / 100),
    image: product.image,
    // Same three-state derivation the PLP uses; the raw count stays in
    // the admin panel.
    stockStatus: deriveStorefrontStockStatus(product.inventory?.stock ?? 0),
  };
}

// The item's explicitly linked product, when this audience may be shown it. A
// product a customer can't buy is not one: publishing it would link to a PDP
// that 404s (getStorefrontProductBySlug excludes the same rows).
function usableLinkedProduct(
  item: FitmentItemWithRelations,
  audience: FitmentAudience,
): FitmentProductRow | null {
  if (!item.product) return null;
  return audience === "admin" || isPubliclyVisible(item.product) ? item.product : null;
}

function toResolvedItem(
  item: FitmentItemWithRelations,
  audience: FitmentAudience,
  specMatches: SpecMatches,
): FitmentResolvedItem {
  const climate = item.climate as FitmentClimate;

  // The precedence: an explicit product wins over a matchSpec on the same item,
  // so pinning a recommendation stays the way to override the query. Only when
  // there is no usable product does the spec get to answer, and only when it
  // finds nothing too does the item fall through to the spec-only card — the
  // car's requirement is still known, and SpecOnlyCard turns it into a Fitment
  // Inquiry. Dropping the item instead would silently shorten the
  // recommendation.
  const linked = usableLinkedProduct(item, audience);
  const products = linked ? [toProductSummary(linked)] : (specMatches.get(item.id) ?? []);

  return {
    id: item.id,
    climate,
    climateLabel: CLIMATE_LABELS[climate],
    priority: item.priority,
    products,
    specNote: item.specNote,
    specAttributes: item.specAttributes,
  };
}

// --- matchSpec resolution --------------------------------------------------
//
// `FitmentProfileItem.matchSpec` is a query against the catalog rather than a
// pointer into it (see the column's comment in schema.prisma): an item that
// carries one resolves to whatever currently matches, so a recommendation
// outlives the individual product it was first written against.

/** The documented shape of the `matchSpec` column. Every key is optional. */
export interface FitmentMatchSpec {
  viscosity?: string;
  apiGrade?: string;
  volumeMl?: number;
}

// How many products one spec may resolve to. A spec is an answer, not a
// listing — past a handful of near-identical oils the customer is being asked
// to shop rather than being told what fits, and the PLP is where shopping
// belongs. Raise it here if the co-equal grid ever needs to be longer.
export const MATCH_SPEC_PRODUCT_LIMIT = 4;

// Codes, not prose: Product.viscosity/apiGrade are stored uppercase (see
// lib/validation/product.ts), so a spec has to be compared uppercase or it
// silently matches nothing. Punctuation is left alone on purpose — "5W30" and
// "5W-30" are different values in the column, so they're different specs here
// too, and a matchSpec has to be written in the form the catalog uses.
function normalizeCode(value: string): string | undefined {
  const trimmed = value.trim().toUpperCase();
  return trimmed || undefined;
}

// The column is free-form Json, so this proves the shape rather than trusting
// it: anything of the wrong type is dropped, and a spec left with no usable key
// is null — matching on nothing would return the whole category.
export function parseMatchSpec(
  value: Prisma.JsonValue | null | undefined,
): FitmentMatchSpec | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const spec: FitmentMatchSpec = {};

  if (typeof raw.viscosity === "string") spec.viscosity = normalizeCode(raw.viscosity);
  if (typeof raw.apiGrade === "string") spec.apiGrade = normalizeCode(raw.apiGrade);
  if (typeof raw.volumeMl === "number" && Number.isInteger(raw.volumeMl) && raw.volumeMl > 0) {
    spec.volumeMl = raw.volumeMl;
  }

  // `normalizeCode` can hand back undefined for a whitespace-only string.
  if (spec.viscosity === undefined) delete spec.viscosity;
  if (spec.apiGrade === undefined) delete spec.apiGrade;

  return Object.keys(spec).length > 0 ? spec : null;
}

/** Item id → the products its `matchSpec` resolved to, best price first. */
export type SpecMatches = Map<string, FitmentProductSummary[]>;

// Two items asking the same question of the same category — the same profile
// re-used across engines, or a HOT and a COLD item that happen to share a
// grade — are one query, so the key is the question rather than the item.
function specQueryKey(categoryId: string, spec: FitmentMatchSpec): string {
  return JSON.stringify([categoryId, spec.viscosity, spec.apiGrade, spec.volumeMl]);
}

// Deliberately not audience-aware: a spec resolves to what a customer could
// actually buy on both surfaces. Nothing points at a deactivated row here, so
// there is no broken link for the admin preview to surface — the reason the
// admin audience keeps a deactivated *linked* product doesn't apply.
async function findProductsForSpec(
  categoryId: string,
  spec: FitmentMatchSpec,
): Promise<FitmentProductSummary[]> {
  const products = await prisma.product.findMany({
    where: {
      categoryId,
      status: "ACTIVE",
      category: { status: "ACTIVE" },
      brand: { status: "ACTIVE" },
      // Every key present has to match; an absent key is not a constraint.
      ...(spec.viscosity !== undefined && { viscosity: spec.viscosity }),
      ...(spec.apiGrade !== undefined && { apiGrade: spec.apiGrade }),
      ...(spec.volumeMl !== undefined && { volumeMl: spec.volumeMl }),
    },
    select: fitmentProductSelect,
  });

  return (
    products
      .map(toProductSummary)
      // Sorted here rather than in the query because finalPrice isn't a column —
      // ordering on `price` would put a discounted product behind a cheaper
      // undiscounted one. Safe to do in memory: the where clause is one category
      // narrowed by exact spec values, so this is a handful of rows.
      .sort((a, b) => a.finalPrice - b.finalPrice)
      .slice(0, MATCH_SPEC_PRODUCT_LIMIT)
  );
}

// One round of queries for a whole resolution — the distinct questions its
// items ask, not one query per item.
export async function resolveSpecMatches(
  items: FitmentItemWithRelations[],
  audience: FitmentAudience = "public",
): Promise<SpecMatches> {
  // An item whose linked product this audience can be shown never consults its
  // spec (see the precedence in `toResolvedItem`), so it isn't worth a query
  // either. An item whose linked product was *deactivated* does: that is the
  // case the whole column exists for — the shop stopped stocking the one oil a
  // recommendation was pinned to, and the spec beside it can still answer.
  const pending = items.flatMap((item) => {
    if (usableLinkedProduct(item, audience)) return [];
    const spec = parseMatchSpec(item.matchSpec);
    return spec ? [{ item, spec, key: specQueryKey(item.categoryId, spec) }] : [];
  });
  if (pending.length === 0) return new Map();

  const queries = new Map(
    pending.map(({ item, spec, key }) => [key, { categoryId: item.categoryId, spec }]),
  );

  const byKey: SpecMatches = new Map();
  await Promise.all(
    Array.from(queries, async ([key, query]) => {
      byKey.set(key, await findProductsForSpec(query.categoryId, query.spec));
    }),
  );

  return new Map(pending.map(({ item, key }) => [item.id, byKey.get(key) ?? []]));
}

// Categories keep the order they first appear in; items within a category are
// re-sorted by priority because an engine can have more than one profile
// attached, which interleaves two already-priority-ordered item lists. Sort is
// stable, so equal priorities keep their createdAt ordering from the query.
// Stays synchronous and pure: `specMatches` is resolved once up front by
// `resolveFitmentGroups` and handed in, rather than each item reaching for the
// database mid-grouping.
export function groupFitmentItemsByCategory(
  items: FitmentItemWithRelations[],
  audience: FitmentAudience = "public",
  specMatches: SpecMatches = new Map(),
): FitmentCategoryGroup[] {
  const groups: {
    category: FitmentCategoryGroup["category"];
    items: FitmentItemWithRelations[];
  }[] = [];
  const groupByCategoryId = new Map<string, (typeof groups)[number]>();

  for (const item of items) {
    let group = groupByCategoryId.get(item.category.id);
    if (!group) {
      group = { category: item.category, items: [] };
      groupByCategoryId.set(item.category.id, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups.map((group) => ({
    category: group.category,
    items: [...group.items]
      .sort((a, b) => a.priority - b.priority)
      .map((item) => toResolvedItem(item, audience, specMatches)),
  }));
}

// The whole read: resolve every matchSpec the items carry, then group. Both
// entry points below go through here so a spec-based item resolves the same way
// on the wizard's results and on a car model page.
export async function resolveFitmentGroups(
  items: FitmentItemWithRelations[],
  audience: FitmentAudience = "public",
): Promise<FitmentCategoryGroup[]> {
  return groupFitmentItemsByCategory(items, audience, await resolveSpecMatches(items, audience));
}

// Flattens every item across all Fitment Profiles attached to a car engine and
// groups them by category — "what should we recommend for this engine", without
// the caller caring how many profiles happen to be linked to it. An engine with
// no profiles (or an id that doesn't exist) resolves to an empty list.
export async function resolveFitmentForEngine(
  carEngineId: string,
  audience: FitmentAudience = "public",
): Promise<FitmentCategoryGroup[]> {
  const links = await prisma.carEngineFitmentProfile.findMany({
    where: { carEngineId },
    include: {
      profile: {
        include: {
          items: {
            include: fitmentItemInclude,
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return resolveFitmentGroups(
    links.flatMap((link) => link.profile.items),
    audience,
  );
}

// --- Car content pages -----------------------------------------------------
//
// Everything below serves `/{locale}/cars/<brand>` and `/{locale}/cars/<brand>/<model>`
// — pages a search engine ranks, not wizard steps (admin Design Decision 7). The
// wizard reads a model to populate a `<select>`; these read it to write a page
// about it, which is why the SEO pair and the year arithmetic live here and not
// in the four selects above.

/** A production range. An open end (`null`) means the car is still being built. */
export interface YearSpan {
  yearStart: number;
  yearEnd: number | null;
}

// The union of several ranges: earliest start, and an open end if any one of
// them is still open. This is what lets a model — or a profile covering three
// engines — state a single "2006–2016" the way a customer would say it.
export function combineYearSpans(spans: YearSpan[]): YearSpan | null {
  if (spans.length === 0) return null;

  let yearStart = Infinity;
  let yearEnd: number | null = -Infinity;

  for (const span of spans) {
    yearStart = Math.min(yearStart, span.yearStart);
    // Once one range is open the union is open, and no closed range can shut it
    // again — so a null end is sticky rather than merely the largest value.
    if (span.yearEnd === null) yearEnd = null;
    else if (yearEnd !== null) yearEnd = Math.max(yearEnd, span.yearEnd);
  }

  return { yearStart, yearEnd };
}

export interface CarModelSummary extends CarModelOption {
  /** Over the model's active engines; null when it has none listed yet. */
  span: YearSpan | null;
  engineCount: number;
}

// The brand page's model index. The engines come back as bare ranges because
// that is all the listing says about them — a count and a span, not a spec.
export async function listCarModelSummariesForBrand(
  carBrandId: string,
): Promise<CarModelSummary[]> {
  const models = await prisma.carModel.findMany({
    where: { carBrandId, status: "ACTIVE" },
    select: {
      ...carModelSelect,
      engines: { where: { status: "ACTIVE" }, select: { yearStart: true, yearEnd: true } },
    },
    orderBy: { nameEn: "asc" },
  });

  return models.map(({ engines, ...model }) => ({
    ...model,
    span: combineYearSpans(engines),
    engineCount: engines.length,
  }));
}

// The model's own SEO copy, which the wizard's `carModelSelect` has no use for.
// A second select rather than four more columns on every wizard response.
const carModelContentSelect = {
  ...carModelSelect,
  metaTitleEn: true,
  metaTitleFa: true,
  metaDescriptionEn: true,
  metaDescriptionFa: true,
} satisfies Prisma.CarModelSelect;

export type CarModelContent = Prisma.CarModelGetPayload<{
  select: typeof carModelContentSelect;
}>;

export interface CarModelContext {
  carModel: CarModelContent;
  carBrand: CarBrandOption;
}

// Addressed by the two slugs that form the URL rather than by id: `CarModel.slug`
// is only unique within its brand (`@@unique([carBrandId, slug])`), so the brand
// slug is half the key, not a label. Same active-up-the-chain rule as every
// lookup above — a deactivated brand takes its model pages down with it.
export async function getActiveCarModelBySlugs(
  brandSlug: string,
  modelSlug: string,
): Promise<CarModelContext | null> {
  const carModel = await prisma.carModel.findFirst({
    where: {
      slug: modelSlug,
      status: "ACTIVE",
      carBrand: { slug: brandSlug, status: "ACTIVE" },
    },
    select: { ...carModelContentSelect, carBrand: { select: carBrandSelect } },
  });
  if (!carModel) return null;

  const { carBrand, ...model } = carModel;
  return { carModel: model, carBrand };
}

export interface SharedProfileSelection {
  profileId: string;
  carEngineIds: string[];
}

// Which of a model's fitment profiles are worth stating as the *model's*
// recommendation rather than leaving to the wizard: one attached to more than a
// single engine, or one attached to every engine the model has (which is what a
// single-engine model's only profile is). A profile covering one engine out of
// five is that engine's answer, not the model's, and stays in the wizard —
// printing it as page copy would claim a range it doesn't cover.
//
// Ordered by coverage, widest first; `sort` is stable, so profiles tied on
// coverage keep the order their links were created in.
export function selectSharedProfiles(
  links: { profileId: string; carEngineId: string }[],
  engineCount: number,
): SharedProfileSelection[] {
  const byProfileId = new Map<string, string[]>();

  for (const link of links) {
    const carEngineIds = byProfileId.get(link.profileId);
    if (carEngineIds) carEngineIds.push(link.carEngineId);
    else byProfileId.set(link.profileId, [link.carEngineId]);
  }

  return Array.from(byProfileId, ([profileId, carEngineIds]) => ({ profileId, carEngineIds }))
    .filter(({ carEngineIds }) => carEngineIds.length > 1 || carEngineIds.length === engineCount)
    .sort((a, b) => b.carEngineIds.length - a.carEngineIds.length);
}

export interface SharedFitmentProfile {
  id: string;
  /** The union of the covered engines' ranges — the "2006–2016" in the heading. */
  span: YearSpan;
  /** The engines it covers, in the model's own order, so the page can name them. */
  engines: CarEngineOption[];
  groups: FitmentCategoryGroup[];
}

export interface CarModelFitment {
  engines: CarEngineOption[];
  /** Over every active engine; null when the model has none listed yet. */
  span: YearSpan | null;
  sharedProfiles: SharedFitmentProfile[];
}

// What a model page can say about fitment before the customer has picked a year:
// its production span, and the recommendations that hold across enough of the
// range to be stated as the model's own.
export async function getCarModelFitment(carModelId: string): Promise<CarModelFitment> {
  const engines = await prisma.carEngine.findMany({
    where: { carModelId, status: "ACTIVE" },
    select: carEngineSelect,
    orderBy: [{ yearStart: "asc" }, { labelEn: "asc" }],
  });

  const span = combineYearSpans(engines);
  if (engines.length === 0) return { engines, span, sharedProfiles: [] };

  // Ids first, profiles second, rather than one nested include: a profile
  // attached to four engines comes back four times through the link table,
  // items and all, and most of those copies are about to be discarded. Two
  // narrow queries read less than one wide one here.
  const links = await prisma.carEngineFitmentProfile.findMany({
    where: { carEngineId: { in: engines.map((engine) => engine.id) } },
    select: { profileId: true, carEngineId: true },
    orderBy: { createdAt: "asc" },
  });

  const shared = selectSharedProfiles(links, engines.length);
  if (shared.length === 0) return { engines, span, sharedProfiles: [] };

  const profiles = await prisma.fitmentProfile.findMany({
    where: { id: { in: shared.map((selection) => selection.profileId) } },
    select: {
      id: true,
      items: {
        include: fitmentItemInclude,
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  const itemsByProfileId = new Map(profiles.map((profile) => [profile.id, profile.items]));
  // Resolved across every shared profile at once rather than per profile: two
  // profiles on one model routinely ask for the same grade, and that's one
  // query either way.
  const specMatches = await resolveSpecMatches(profiles.flatMap((profile) => profile.items));

  return {
    engines,
    span,
    sharedProfiles: shared.flatMap((selection) => {
      const items = itemsByProfileId.get(selection.profileId) ?? [];
      const covered = new Set(selection.carEngineIds);
      // Filtered out of `engines` rather than mapped from the link rows, so the
      // labels read in the model's own year order.
      const profileEngines = engines.filter((engine) => covered.has(engine.id));
      const profileSpan = combineYearSpans(profileEngines);

      // An empty profile has nothing to state as content; the wizard can still
      // resolve to it and show its (equally empty) results.
      if (items.length === 0 || profileSpan === null) return [];

      return [
        {
          id: selection.profileId,
          span: profileSpan,
          engines: profileEngines,
          groups: groupFitmentItemsByCategory(items, "public", specMatches),
        },
      ];
    }),
  };
}
