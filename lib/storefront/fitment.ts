import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";

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

/** The subset of a car engine needed to write its option label. */
export interface CarEngineLabelParts {
  labelEn: string;
  labelFa: string;
  yearStart: number;
  yearEnd: number | null;
}

// "2001–2010", or "2001–Present" while the car is still being built — a null
// `yearEnd` means still in production, not unknown. Takes a bare span rather
// than an engine so the PDP can write a whole model's range with it too.
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

// "4 engines" — how many variants a car model was sold with, next to its year
// span on the car content pages. Persian has no plural inflection to match, so
// only the English form has the singular case.
export function formatEngineCount(locale: Locale, count: number): string {
  const digits = formatDigits(count, locale);
  return pickLocale(locale, `${digits} ${count === 1 ? "engine" : "engines"}`, `${digits} موتور`);
}

// "1.4L TU3 Petrol (2001–2010)". The range is part of the label because two
// engines of one model often differ by nothing else a customer can see.
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
// the order the design brief lists them. Ranked on partType/filterKind — never
// on the category name, per the fitment rules in CLAUDE.md.
const PART_TYPE_RANK: Record<string, number> = {
  ENGINE_OIL: 0,
  FILTER: 1,
  ACCESSORY: 2,
  OTHER: 3,
};

const FILTER_KIND_RANK: Record<string, number> = {
  OIL_FILTER: 0,
  AIR_FILTER: 1,
  CABIN_FILTER: 2,
  FUEL_FILTER: 3,
};

const UNRANKED = 9;

export interface FitmentCategoryParts {
  partType: string;
  filterKind: string | null;
}

export function fitmentCategoryRank(category: FitmentCategoryParts): number {
  const part = PART_TYPE_RANK[category.partType] ?? UNRANKED;
  const kind =
    category.filterKind === null ? 0 : (FILTER_KIND_RANK[category.filterKind] ?? UNRANKED);
  return part * 10 + kind;
}

// Sort is stable, so two categories of the same kind keep the order the service
// resolved them in.
export function sortFitmentGroups<T extends { category: FitmentCategoryParts }>(groups: T[]): T[] {
  return [...groups].sort(
    (a, b) => fitmentCategoryRank(a.category) - fitmentCategoryRank(b.category),
  );
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
