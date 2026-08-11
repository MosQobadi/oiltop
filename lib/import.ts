// Every rule the importer applies to a scraped record before it can become a
// row — source refs, slugs, SKUs, spec parsing, fuel types, discounts. Pure
// functions over plain data: no Prisma, no filesystem, no console. That keeps
// `scripts/import.ts` about orchestration (read, upsert, report, roll back) and
// lets the rules that are actually easy to get wrong be tested without a
// database.
//
// The source is Persian and the target schema is bilingual and Latin-slugged,
// so most of what follows is one of two jobs: reading a number out of Persian
// prose, or manufacturing a stable Latin identifier for something that has no
// Latin name. Both are done once here rather than per record at the call site.

import { createHash } from "node:crypto";
import { VISCOSITY_PATTERN } from "./validation/product";
import { slugify } from "./slug";

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

// "۴ لیتر" and "٤ لیتر" are both "4 لیتر" — Persian (U+06F0..) and Arabic-Indic
// (U+0660..) digits, which every numeric parse below has to survive.
export function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

// For *matching* only — never for anything that gets stored. Persian text goes
// into the database exactly as the source printed it (D.1's rule); this exists
// so "درجه گرانروی" written with an Arabic yeh, a ZWNJ or a double space still
// finds its entry in the tables below instead of silently parsing to null.
export function normaliseForMatch(text: string): string {
  return toLatinDigits(text)
    .replace(/‌/g, " ") // ZWNJ reads as a word break here
    .replace(/ي/g, "ی") // Arabic yeh -> Persian yeh
    .replace(/ك/g, "ک") // Arabic kaf -> Persian kaf
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The admin form validates names at 200, descriptions at 500/5000 and engine
// labels at 100 (lib/validation/). The importer doesn't go through those
// schemas — it can't, since it fills descriptions with "" — but an imported row
// still has to be *editable* afterwards, and a 700-character short description
// would make the product form reject a row nobody had touched. So the same
// limits are applied on the way in.
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

export const NAME_MAX = 200;
export const SHORT_DESCRIPTION_MAX = 500;
export const LONG_DESCRIPTION_MAX = 5000;
export const ENGINE_LABEL_MAX = 100;

// ---------------------------------------------------------------------------
// Identity: sourceRef, slug, sku
// ---------------------------------------------------------------------------

// The four models that carry `sourceRef`. The kind is part of the ref because
// the natural keys aren't unique across kinds — a brand and a car brand are
// both "تویوتا" — and because a ref you can read tells you what it points at.
export type SourceRefKind = "product" | "brand" | "car-brand" | "car-model";

// "oil-city:product/toyota-5w30-4l", per the convention documented on
// Product.sourceRef. Key parts are whitespace-collapsed and trimmed: a stray
// space in the source would otherwise mint a second ref for the same record and
// re-import it as a duplicate row on the next run.
export function sourceRefFor(source: string, kind: SourceRefKind, ...keyParts: string[]): string {
  const key = keyParts.map((part) => part.replace(/\s+/g, " ").trim()).join("/");
  return `${source}:${kind}/${key}`;
}

// Short, stable, and derived from the sourceRef rather than a counter, so the
// same record produces the same identifier on every run of every machine —
// which is what makes a re-import find its own rows instead of making new ones.
export function refHash(sourceRef: string): string {
  return createHash("sha1").update(sourceRef).digest("hex").slice(0, 10);
}

// Below this a Latin remnant isn't a name any more. "فیلتر-روغن-x" slugifies to
// "x", which is neither readable nor unlikely to collide; three characters is
// the line between "the source had a Latin slug" and "one letter survived".
const MIN_LATIN_SLUG_LENGTH = 3;

export function fallbackSlug(prefix: string, sourceRef: string): string {
  return `${prefix}-${refHash(sourceRef)}`;
}

// The one slug rule, decided once (mismatch 3.4 in oil-city-import-notes.md).
// `slugify` strips everything outside [a-z0-9], so `slugify("فیلتر روغن")` is
// "" and the source's own URL slug is Latin only about half the time. Where it
// is Latin we keep it — an imported product at /fa/products/toyota-5w30-sn-4l
// is worth having. Where it isn't, the hash of the sourceRef is: unreadable,
// but stable, unique, and never empty.
export function deriveSlug(options: {
  sourceSlug: string | null;
  sourceRef: string;
  prefix: string;
}): string {
  const latin = slugify(options.sourceSlug ?? "");
  if (latin.length >= MIN_LATIN_SLUG_LENGTH) return truncate(latin, 80);
  return fallbackSlug(options.prefix, options.sourceRef);
}

// Product.sku is required and unique and the source has no such thing, so it is
// manufactured from the same hash the fallback slug uses. Prefixed with the
// source so an admin looking at "OILCITY-3f2a9c11ab" can see at a glance that
// nobody typed it in.
export function deriveSku(source: string, sourceRef: string): string {
  const prefix = slugify(source).replace(/-/g, "").toUpperCase().slice(0, 8) || "IMPORT";
  return `${prefix}-${refHash(sourceRef).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

// The source's spec badges are a free-form Persian key/value object, so the
// three structured columns A.3 added are filled from an explicit table of the
// keys actually seen, matched exactly after normalisation. An unrecognised key
// leaves the column null — the raw object is stored in `Product.specs` whole,
// so nothing is lost by not recognising it, and a wrong viscosity is far worse
// than a missing one: it is the one dimension the catalog is filtered on.
const VISCOSITY_KEYS = ["درجه گرانروی", "گرانروی", "ویسکوزیته", "sae", "viscosity"];
const API_GRADE_KEYS = ["کیفیت", "درجه کیفیت", "کیفیت api", "استاندارد", "api", "api grade"];
const VOLUME_KEYS = ["حجم", "حجم روغن", "ظرفیت", "volume"];

// Litres and millilitres, in the spellings the badges use. Ordered longest-unit
// first so "میلی لیتر" is never read as "لیتر".
const VOLUME_UNITS: ReadonlyArray<readonly [string, number]> = [
  ["میلی لیتر", 1],
  ["سی سی", 1],
  ["ml", 1],
  ["cc", 1],
  ["لیتر", 1000],
  ["litre", 1000],
  ["liter", 1000],
  ["l", 1000],
];

// A car takes 3–8 litres and the largest thing the source sells is a drum, so
// anything past a barrel is a misparse, not a product.
const MAX_VOLUME_ML = 250_000;

export function parseVolumeMl(value: string): number | null {
  const text = normaliseForMatch(value);
  const units = VOLUME_UNITS.map(([unit]) => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  // No \b after the unit: JS word boundaries are defined on ASCII, so "لیتر"
  // at the end of a string has no boundary after it and the match would never
  // fire. The Latin lookahead is what "l" needs instead, so it can't take the
  // first letter of a longer word.
  const match = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${units})(?![a-z])`));
  if (!match) return null;

  const amount = Number(match[1].replace(",", "."));
  const factor = VOLUME_UNITS.find(([unit]) => unit === match[2])?.[1];
  if (!Number.isFinite(amount) || amount <= 0 || factor === undefined) return null;

  const volumeMl = Math.round(amount * factor);
  return volumeMl > 0 && volumeMl <= MAX_VOLUME_ML ? volumeMl : null;
}

// Stored in the same shape the admin form stores it (uppercase, separator as
// written) because a fitment `matchSpec` matches these columns exactly — see
// the comment on viscositySchema in lib/validation/product.ts. A value that
// doesn't match VISCOSITY_PATTERN is dropped rather than stored as prose.
export function parseViscosity(value: string): string | null {
  const text = toLatinDigits(value).toUpperCase().replace(/\s+/g, " ").trim();
  const match = text.match(/(\d{1,3}\s?W\s?-?\s?\d{1,3}|\d{1,3}\s?W|\b\d{1,3}\b)/);
  if (!match) return null;

  const candidate = match[1].replace(/\s+/g, "");
  return VISCOSITY_PATTERN.test(candidate) ? candidate : null;
}

// "API SN" and "SN" are the same grade; the column stores the grade.
export function parseApiGrade(value: string): string | null {
  const text = toLatinDigits(value)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^API[\s:]+/, "");

  // Codes only. Persian prose in a "کیفیت" badge is a description, not a grade.
  if (!/^[A-Z0-9 /+-]+$/.test(text) || !/[A-Z]/.test(text)) return null;
  return truncate(text, 20);
}

export type ParsedProductSpecs = {
  viscosity: string | null;
  apiGrade: string | null;
  volumeMl: number | null;
};

export function parseProductSpecs(specs: Record<string, string>): ParsedProductSpecs {
  const byKey = new Map(
    Object.entries(specs).map(([key, value]) => [normaliseForMatch(key), value]),
  );

  const read = <T>(keys: string[], parse: (value: string) => T | null): T | null => {
    for (const key of keys) {
      const value = byKey.get(normaliseForMatch(key));
      if (value === undefined) continue;
      const parsed = parse(value);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  return {
    viscosity: read(VISCOSITY_KEYS, parseViscosity),
    apiGrade: read(API_GRADE_KEYS, parseApiGrade),
    volumeMl: read(VOLUME_KEYS, parseVolumeMl),
  };
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

// The source shows two figures and no percentage; we store one figure and a
// percentage. Rounded, because a page that reads "1,780,000 → 1,450,000" is
// 18.5% off and the column is an Int. An "original" that isn't above the price
// isn't a discount, whatever the page was doing with the strikethrough.
export function discountPercentFrom(
  priceToman: number | null,
  originalPriceToman: number | null,
): number {
  if (priceToman === null || originalPriceToman === null) return 0;
  if (originalPriceToman <= 0 || originalPriceToman <= priceToman) return 0;
  const percent = Math.round((1 - priceToman / originalPriceToman) * 100);
  return Math.min(Math.max(percent, 0), 100);
}

// ---------------------------------------------------------------------------
// Fuel type
// ---------------------------------------------------------------------------

export type ImportFuelType = "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "LPG_CNG";

// CarEngine.fuelType is a required enum and the source publishes no such field
// — only whatever the model's own title happens to say ("1800cc هیبرید"). So it
// is read from that wording through this table and nothing else: an unmatched
// model is reported and gets no engine, because the alternative is defaulting
// 800 cars to PETROL, and a customer filtering by fuel type would never know
// which of those we actually knew.
//
// Order is the rule, not decoration. A hybrid's title says "بنزینی هیبرید" and
// a dual-fuel car's says "دوگانه سوز بنزین/گاز", so the more specific terms
// have to be checked before "بنزین" or they never match.
export const FUEL_TYPE_TERMS: ReadonlyArray<readonly [string, ImportFuelType]> = [
  ["هیبرید", "HYBRID"],
  ["hybrid", "HYBRID"],
  ["دوگانه سوز", "LPG_CNG"],
  ["گازسوز", "LPG_CNG"],
  ["سی ان جی", "LPG_CNG"],
  ["ال پی جی", "LPG_CNG"],
  ["cng", "LPG_CNG"],
  ["lpg", "LPG_CNG"],
  ["دیزل", "DIESEL"],
  ["گازوئیل", "DIESEL"],
  ["diesel", "DIESEL"],
  ["تمام برقی", "ELECTRIC"],
  ["برقی", "ELECTRIC"],
  ["الکتریکی", "ELECTRIC"],
  ["electric", "ELECTRIC"],
  ["بنزینی", "PETROL"],
  ["بنزین", "PETROL"],
  ["petrol", "PETROL"],
  ["gasoline", "PETROL"],
];

export type FuelTypeMatch = { fuelType: ImportFuelType; term: string };

export function mapFuelType(...texts: Array<string | null>): FuelTypeMatch | null {
  const haystack = normaliseForMatch(texts.filter((text) => text !== null).join(" "));
  if (haystack === "") return null;

  for (const [term, fuelType] of FUEL_TYPE_TERMS) {
    if (haystack.includes(normaliseForMatch(term))) return { fuelType, term };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Brand labels
// ---------------------------------------------------------------------------

// mismatch 3.5: a Toyota-titled oil carries "برند : لکسوس". The label is
// imported as printed and never corrected — this only decides whether the
// summary calls it out for a human to look at. "The brand doesn't appear in the
// title" is the whole test; anything cleverer would be the auto-correction the
// notes rule out.
export function brandLabelDisagrees(nameFa: string | null, brandLabelFa: string | null): boolean {
  if (nameFa === null || brandLabelFa === null) return false;
  const label = normaliseForMatch(brandLabelFa);
  if (label === "") return false;
  return !normaliseForMatch(nameFa).includes(label);
}

// ---------------------------------------------------------------------------
// Rows the importer has to be able to fall back to
// ---------------------------------------------------------------------------

// DECISION 2, as answered for this task: a product whose category the extractor
// couldn't place lands in one holding category rather than being dropped or
// guessed at. INACTIVE and partType OTHER, so it can't reach the storefront's
// category browse before someone has looked at it; the summary lists the
// source's own wording per product so the real categories can be created by
// hand and the products re-filed.
//
// Deliberately one category, not one per source wording: Category carries no
// `sourceRef` (A.2 added it to Product/Brand/CarBrand/CarModel only), so
// auto-created categories would have no idempotency key beyond a slug derived
// from Persian text, and 27 empty-descriptioned categories is a worse thing to
// hand an admin than one labelled shelf.
export const UNCATEGORISED_CATEGORY = {
  slug: "imported-uncategorised",
  nameEn: "Uncategorised (imported)",
  nameFa: "دسته‌بندی‌نشده (وارداتی)",
  shortDescriptionEn: "Imported products whose source category has no match in this catalog yet.",
  shortDescriptionFa: "محصولات وارد شده که دسته‌بندی مبدأ آن‌ها هنوز در این فروشگاه وجود ندارد.",
  longDescriptionEn: "",
  longDescriptionFa: "",
  partType: "OTHER",
  status: "INACTIVE",
} as const;

// Product.brandId is required and `brandLabelFa` is nullable, so a product the
// source printed no brand for still needs somewhere to hang. Same shape of
// answer as the holding category, and equally visible: INACTIVE, and counted in
// the summary.
export const UNKNOWN_BRAND = {
  slug: "imported-unknown-brand",
  nameEn: "Unknown brand (imported)",
  nameFa: "برند نامشخص (وارداتی)",
  status: "INACTIVE",
} as const;

// DECISION 1: oil-city.ir publishes no years and `CarEngine.yearStart` is
// required, so a synthesised engine gets a span wide enough to be honest rather
// than a precise year nobody knows. yearEnd stays null ("still in production").
// The wizard's year step therefore offers every year from here for imported
// cars — vague, but never wrong, and narrowing it by hand later is the point of
// leaving it alone on re-import.
export const IMPORTED_YEAR_START = 2000;
