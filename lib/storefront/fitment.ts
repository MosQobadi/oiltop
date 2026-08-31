import { formatDigits, NUMBER_LOCALE, pickLocale, type Locale } from "@/lib/i18n";

// The car-finder's shared vocabulary: how a resolved car travels between pages,
// and how an engine reads once it gets there. The wizard, the results page, the
// PLP banner and the PDP's "fits your car" line all go through here so none of
// them invents its own query key or its own way of writing a year range.

// Design Decision 5: a resolved car is carried as a query param, never baked
// into a canonical URL. `/en/products/mobil1-5w30` stays car-agnostic for SEO;
// `?fit=<carEngineId>` is the context riding alongside it.
export const FIT_PARAM = "fit";

export function withFitContext(href: string, carEngineId: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${FIT_PARAM}=${encodeURIComponent(carEngineId)}`;
}

// The results page's third state: one category, uncapped. It rides on `?fit=`
// rather than being its own route for the same reason `?fit=` itself does —
// there is no page here that a search engine should rank separately, and
// "See all 44" has to be a plain link a Server Component can render.
export const FIT_CATEGORY_PARAM = "category";

export function withFitCategory(href: string, categorySlug: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${FIT_CATEGORY_PARAM}=${encodeURIComponent(categorySlug)}`;
}

/** The subset of a car engine needed to write its option label. */
export interface CarEngineLabelParts {
  labelEn: string;
  labelFa: string;
  yearStart: number;
  yearEnd: number | null;
}

// Which photo a car type shows: its own if it has one, otherwise its model's.
// A 206 Type 2 and a Type 5 don't look alike, and a 2015 Tucson doesn't look
// like a 2025 one — but most types never need their own picture, so the column
// is null far more often than not and the model's photo is the honest default.
//
// Everything that renders a type goes through here rather than reading
// `engine.image`, which is what stops one surface from showing a gap where
// another shows the model. Null from here means genuinely no photo anywhere.
export function variantImage(
  engine: { image: string | null },
  model: { image: string | null } | null | undefined,
): string | null {
  return engine.image ?? model?.image ?? null;
}

// "2001–2010", or "2001–Present" while the car is still being built — a null
// `yearEnd` means still in production, not unknown. Takes a bare span rather
// than an engine so the PDP can write a whole model's range with it too.
//
// It deliberately does NOT take the model's `yearCalendar`, and that is not an
// oversight. Years are stored exactly as written (see lib/year.ts), so a Jalali
// span already renders as ۱۳۹۰–۱۳۹۹ and a Gregorian one as ۲۰۱۵–۲۰۲۰ — and the
// number says which it is, for the same reason the two calendars never collide:
// no Gregorian car has a year 1390. A brand page listing both, as Saipa's does,
// reads the way every Iranian car site presents it. Adding a calendar marker
// here would label something the reader has already read.
export function formatYearSpan(
  locale: Locale,
  span: { yearStart: number; yearEnd: number | null },
): string {
  const start = formatDigits(span.yearStart, locale);
  const end =
    span.yearEnd === null
      ? pickLocale(locale, "Present", "تاکنون")
      : formatDigits(span.yearEnd, locale);

  return `${start}–${end}`;
}

// "4 types" — how many variants a car model was sold with, next to its year
// span on the car content pages. Persian has no plural inflection to match, so
// only the English form has the singular case.
//
// "Type" (تیپ), not "engine": a CarEngine row is the *version* a customer picks
// — trim, engine and year span together — and in this market people identify
// their car as "206 تیپ ۲", never by an engine code. The schema keeps the
// CarEngine name; only what a customer reads changes.
export function formatTypeCount(locale: Locale, count: number): string {
  const digits = formatDigits(count, locale);
  return pickLocale(locale, `${digits} ${count === 1 ? "type" : "types"}`, `${digits} تیپ`);
}

// The `FuelType` enum, as a customer reads it. A value this doesn't know about
// is returned as-is rather than dropped — a new enum member should show up as
// its own name, not vanish from the car's spec line.
const FUEL_TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  PETROL: { en: "Petrol", fa: "بنزینی" },
  DIESEL: { en: "Diesel", fa: "دیزلی" },
  HYBRID: { en: "Hybrid", fa: "هیبریدی" },
  ELECTRIC: { en: "Electric", fa: "برقی" },
  LPG_CNG: { en: "LPG/CNG", fa: "دوگانه‌سوز" },
};

export function formatFuelType(locale: Locale, fuelType: string): string {
  const label = FUEL_TYPE_LABELS[fuelType];
  return label ? pickLocale(locale, label.en, label.fa) : fuelType;
}

// 1598cc → "1.6L". Cubic centimetres are how the column stores it and how
// nobody says it; the rounded litre figure is the one on the car's boot lid.
// Not `formatDigits` — that drops the fraction this exists to show.
export function formatDisplacement(locale: Locale, displacementCc: number): string {
  const litres = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(displacementCc / 1000);

  return pickLocale(locale, `${litres}L`, `${litres} لیتر`);
}

// "1.4L TU3 Petrol (2001–2010)". The range is part of the label because two
// types of one model often differ by nothing else a customer can see.
export function formatEngineOptionLabel(locale: Locale, engine: CarEngineLabelParts): string {
  const name = pickLocale(locale, engine.labelEn, engine.labelFa);
  return `${name} (${formatYearSpan(locale, engine)})`;
}

/** Enough of a resolved car to write its header, breadcrumb and request line. */
export interface CarContextParts {
  carBrand: { nameEn: string; nameFa: string };
  carModel: { nameEn: string; nameFa: string };
  carEngine: CarEngineLabelParts;
}

// "Peugeot 206" — the car as a customer names it, for the breadcrumb and the
// results heading. The engine is a separate line there, so it isn't in here.
export function formatCarName(locale: Locale, car: CarContextParts): string {
  const brand = pickLocale(locale, car.carBrand.nameEn, car.carBrand.nameFa);
  const model = pickLocale(locale, car.carModel.nameEn, car.carModel.nameFa);
  return `${brand} ${model}`;
}

// "Peugeot 206 · 1.4L TU3 Petrol (2001–2010)" — the whole car on one line, for
// places that get a single string: the request message, a page title.
export function formatCarLabel(locale: Locale, car: CarContextParts): string {
  return `${formatCarName(locale, car)} · ${formatEngineOptionLabel(locale, car.carEngine)}`;
}

// --- Results shaping -------------------------------------------------------
//
// The three helpers below are what turns a category's flat item list into the
// results layout. They're structural (a `climate` string, a `partType` string)
// rather than typed against lib/services/fitment, so nothing here drags Prisma
// into the client bundle.

export type FitmentClimateValue = "STANDARD" | "HOT" | "COLD";

// Category order is a display decision, not a data one: the service returns
// categories in the order the profile's items happen to be stored, which is
// whatever the admin entered first. A customer expects oil, then filters, in
// the order the design brief lists them.
//
// Two keys, in this order. `partType` is how a category behaves, so it puts oil
// ahead of filters ahead of everything else. Within one part type the order is
// the design brief's, keyed on the category's *slug* — its stable identity, not
// the name that gets reworded, and not a second enum that would have to be kept
// in step with the categories it describes. Never rank on a category name.
// The six a car's results page shows above the fold, in this order. They are a
// product decision rather than an admin one: this is the maintenance a customer
// came for, and a shop that adds a shelf does not get to push "Oil Filter"
// below it. Everything else the car resolves to is real and is still shown —
// behind "Show more", in the admin's own order.
export const PRIMARY_CATEGORY_SLUGS = [
  "engine-oil",
  "gearbox-oil",
  "oil-filter",
  "cabin-filter",
  "air-filter",
  "fuel-filter",
] as const;

const PRIMARY_RANK = new Map<string, number>(
  PRIMARY_CATEGORY_SLUGS.map((slug, index) => [slug, index]),
);

// The secondary band's coarse order. `partType` is how a category *behaves*, so
// oils come before filters before parts — and the two kinds a customer buys as
// an extra rather than as maintenance sort last, which is what "the accessories
// at the end" means.
const PART_TYPE_RANK: Record<string, number> = {
  ENGINE_OIL: 0,
  FILTER: 1,
  OTHER: 2,
  ACCESSORY: 3,
};

// Within a band, the admin's stated running order — the same `Category.sortOrder`
// the nav, the home browse section and the PLP filter rail read, so a shelf sits
// in the same place on every surface. Null means "unordered" there and means it
// here too: after everything numbered, in the order the service resolved it.
const UNORDERED = 9999;

export interface FitmentCategoryParts {
  slug: string;
  partType: string;
  sortOrder: number | null;
}

export function fitmentCategoryRank(category: FitmentCategoryParts): number {
  const primary = PRIMARY_RANK.get(category.slug);
  if (primary !== undefined) return primary;

  const band = PART_TYPE_RANK[category.partType] ?? PART_TYPE_RANK.OTHER;
  return PRIMARY_CATEGORY_SLUGS.length + band * 100_000 + (category.sortOrder ?? UNORDERED);
}

// Sort is stable, so two categories of the same kind keep the order the service
// resolved them in.
export function sortFitmentGroups<T extends { category: FitmentCategoryParts }>(groups: T[]): T[] {
  return [...groups].sort(
    (a, b) => fitmentCategoryRank(a.category) - fitmentCategoryRank(b.category),
  );
}

export function isPrimaryFitmentCategory(category: FitmentCategoryParts): boolean {
  return PRIMARY_RANK.has(category.slug);
}

// The oil-city importer's holding shelf (lib/import.ts's UNCATEGORISED_CATEGORY
// — the slug is repeated here rather than imported, because that module pulls in
// node:crypto and this one is reachable from a Client Component). It is a review
// queue with a name to match, and "Uncategorised (imported)" is not a heading to
// put in front of a customer. Its products stay in the catalog and in the admin;
// they just don't get to be a section on a car's results until somebody has said
// what they are. Emptying it is `scripts/refile-imported-products.ts`.
const HOLDING_CATEGORY_SLUG = "imported-uncategorised";

/** The results page's two zones: what a customer sees, and what "Show more" opens. */
export function partitionFitmentGroups<T extends { category: FitmentCategoryParts }>(groups: T[]) {
  const sorted = sortFitmentGroups(groups).filter(
    (group) => group.category.slug !== HOLDING_CATEGORY_SLUG,
  );
  return {
    primary: sorted.filter((group) => isPrimaryFitmentCategory(group.category)),
    secondary: sorted.filter((group) => !isPrimaryFitmentCategory(group.category)),
  };
}

// --- Clipping a section ----------------------------------------------------
//
// A recommendation is an answer, not a listing. oil-city's own page for a
// Peugeot 206 names 44 acceptable engine oils, and rendering all 44 asks the
// customer to shop the exact question they came here to have answered. Four,
// and a link to the rest.

export const FITMENT_CARDS_PER_SECTION = 4;

/** One item is one card, except a spec-based item, which is one card per match. */
export function countFitmentCards(items: { products: unknown[] }[]): number {
  return items.reduce((count, item) => count + Math.max(1, item.products.length), 0);
}

export interface ClippedFitmentItems<T> {
  items: T[];
  /** Cards the section would hold uncapped — the N in "See all N". */
  total: number;
}

// Clipped by card rather than by item, because one spec-based item can resolve
// to four products on its own. The first item is always kept: a section that
// rendered nothing would read as "we have nothing for your car", which is the
// opposite of what a section with too much in it means.
export function clipFitmentItems<T extends { products: unknown[] }>(
  items: T[],
  limit: number = FITMENT_CARDS_PER_SECTION,
): ClippedFitmentItems<T> {
  const kept: T[] = [];
  let cards = 0;

  for (const item of items) {
    const size = Math.max(1, item.products.length);
    if (cards > 0 && cards + size > limit) break;
    kept.push(item);
    cards += size;
    if (cards >= limit) break;
  }

  return { items: kept, total: countFitmentCards(items) };
}

// HOT and COLD are co-equal options shown side by side, not a fallback chain,
// so they're split out rather than sorted — the layout needs to know which
// column an item belongs in before it can render either.
export function splitItemsByClimate<T extends { climate: FitmentClimateValue }>(items: T[]) {
  return {
    standard: items.filter((item) => item.climate === "STANDARD"),
    hot: items.filter((item) => item.climate === "HOT"),
    cold: items.filter((item) => item.climate === "COLD"),
  };
}

export function climateColumnLabel(locale: Locale, climate: "HOT" | "COLD"): string {
  return climate === "HOT"
    ? pickLocale(locale, "For hot climates", "برای اقلیم گرم")
    : pickLocale(locale, "For cold climates", "برای اقلیم سرد");
}

// The winter grade in "5W-40" — the 5. Null for a monograde ("40"), for prose,
// and for a product with no viscosity recorded at all. It is the only half of a
// multigrade that says anything about cold weather; the second number is the
// hot-side one and is the same on both sides of the split below.
export function winterGrade(viscosity: string | null | undefined): number | null {
  if (!viscosity) return null;
  const match = /^(\d{1,3})W/.exec(viscosity.trim().toUpperCase());
  return match === null ? null : Number(match[1]);
}

/** 0W and 5W are the cold-climate grades; 10W and above are the hot-climate ones. */
export const COLD_WINTER_GRADE_MAX = 5;

// The imported fitment data carries no climate at all — oil-city states one list
// per car "for all four seasons" (mismatch 3.5 of the import notes) — so 667 car
// profiles would show one flat run of oils where the useful answer is two
// columns. Rather than hand-authoring HOT/COLD onto 16,000 items, this reads the
// split back out of the grades the recommended oils already carry: a 206's list
// holds a 10W-40 and a 5W-40 precisely because both are approved and the choice
// between them is where the car lives.
//
// Deliberately narrow, because a wrong oil damages an engine:
//
//   * Only when EVERY item is STANDARD. An admin who has said which grade is
//     which is never second-guessed — authored climate always wins.
//   * Only when both sides are non-empty. One grade is one answer, and calling
//     it "for hot climates" would imply a cold option that doesn't exist.
//   * Only when every item can be placed. An oil with no grade recorded belongs
//     in neither column and dropping it would shorten the recommendation, so a
//     section holding one falls back to being rendered flat.
//
// An item is placed by its first product: an imported item has exactly one, and
// a spec-based item's matches all share the viscosity the spec asked for.
// Returns null when no split is derivable — read by the caller as "render this
// section the way it was stored".
export function deriveClimateByViscosity<
  T extends { climate: FitmentClimateValue; products: { viscosity: string | null }[] },
>(items: T[]): T[] | null {
  if (items.length === 0) return null;
  if (items.some((item) => item.climate !== "STANDARD")) return null;

  const placed: T[] = [];
  let hot = 0;
  let cold = 0;

  for (const item of items) {
    const grade = winterGrade(item.products[0]?.viscosity);
    if (grade === null) return null;

    if (grade <= COLD_WINTER_GRADE_MAX) {
      cold += 1;
      placed.push({ ...item, climate: "COLD" });
    } else {
      hot += 1;
      placed.push({ ...item, climate: "HOT" });
    }
  }

  return hot > 0 && cold > 0 ? placed : null;
}

// --- Spec-only items -------------------------------------------------------

export interface SpecAttributeRow {
  label: string;
  value: string;
}

// "apiRating" → "Api Rating". Keys are admin-entered JSON, so there's no
// dictionary to translate them against — this only makes them readable.
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatSpecValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(formatSpecValue).filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  // Nested objects and nulls have no sensible one-line rendering; a spec table
  // is a flat list of "what the engine needs", so they're dropped rather than
  // stringified into a customer's face.
  return null;
}

// `specAttributes` is a free-form Json column, so this takes `unknown` and
// proves the shape rather than trusting it.
export function formatSpecAttributes(specAttributes: unknown): SpecAttributeRow[] {
  if (
    specAttributes === null ||
    typeof specAttributes !== "object" ||
    Array.isArray(specAttributes)
  ) {
    return [];
  }

  const rows: SpecAttributeRow[] = [];
  for (const [key, value] of Object.entries(specAttributes as Record<string, unknown>)) {
    const formatted = formatSpecValue(value);
    if (formatted !== null) rows.push({ label: humanizeKey(key), value: formatted });
  }
  return rows;
}

// A spec-only item as one line of prose, for the car content pages — those
// state a model's recommendation as readable text rather than as a grid of
// cards, so a spec that has no product yet still has to read as a sentence
// fragment ("5W-30, API SL or newer"). Null when the admin filled in neither:
// there is nothing to say, and an em dash isn't content.
export function formatSpecSummary(item: {
  specNote: string | null;
  specAttributes: unknown;
}): string | null {
  const rows = formatSpecAttributes(item.specAttributes);
  if (rows.length > 0) return rows.map((row) => row.value).join(", ");
  return item.specNote?.trim() || null;
}

// The message the "Request it" form (Task 3.3) opens pre-filled:
// "Looking for: 5W-30 or 10W-40, API SL or newer — Engine Oil for Peugeot 206 ·
// 1.4L TU3 Petrol (2001–2010)". Built from the spec attributes when there are
// any, because those read as a spec; the free-text note is the fallback.
export function buildFitmentRequestMessage(
  locale: Locale,
  input: {
    carLabel: string;
    categoryName: string | null;
    specNote: string | null;
    specAttributes: unknown;
  },
): string {
  const spec = formatSpecSummary(input);

  // With no category this is the whole-car case ("nothing matched at all"), so
  // the subject names what's being asked for instead of leaving a dangling "for".
  const what = input.categoryName ?? pickLocale(locale, "Parts", "قطعات");
  const subject = pickLocale(
    locale,
    `${what} for ${input.carLabel}`,
    `${what} برای ${input.carLabel}`,
  );

  if (!spec) return pickLocale(locale, `Looking for: ${subject}`, `به دنبال: ${subject}`);
  return pickLocale(locale, `Looking for: ${spec} — ${subject}`, `به دنبال: ${spec} — ${subject}`);
}
