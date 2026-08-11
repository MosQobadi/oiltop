import { formatYearSpan } from "./fitment";
import { formatNumber } from "./pricing";
import { pickLocale, type Locale } from "@/lib/i18n";

// The product page's shared vocabulary — turning the catalog's flat "this
// product fits these car engines" list into something a customer can read, and
// writing the structured spec columns out as display rows.
//
// The service hands back one row per engine, which for a common 5W-30 is a
// hundred near-identical lines: three trims of a Peugeot 206 across four year
// ranges is not four facts, it's one — "the 206". So the list is grouped by
// model here and the engines become the detail underneath.
//
// Props are structural rather than the service's `FittingCarEngine`, same rule
// as lib/storefront/fitment.ts: nothing in this folder drags Prisma's generated
// types into a component tree.

export interface FittingEngineParts {
  carEngineId: string;
  labelEn: string;
  labelFa: string;
  yearStart: number;
  yearEnd: number | null;
  carModel: { id: string; nameEn: string; nameFa: string };
  carBrand: { nameEn: string; nameFa: string };
}

export interface FittingVehicleGroup {
  modelId: string;
  carBrand: { nameEn: string; nameFa: string };
  carModel: { nameEn: string; nameFa: string };
  engines: FittingEngineParts[];
  /** Earliest year any of the model's listed engines was built. */
  yearStart: number;
  /** Latest, or null if any one of them is still in production. */
  yearEnd: number | null;
}

// Insertion order is the output order: the service already sorts its rows by
// brand, then model, then year, so re-sorting here would only give the section
// a second opinion about the same list.
export function groupFittingEnginesByModel(engines: FittingEngineParts[]): FittingVehicleGroup[] {
  const groups = new Map<string, FittingVehicleGroup>();

  for (const engine of engines) {
    const group = groups.get(engine.carModel.id);
    if (!group) {
      groups.set(engine.carModel.id, {
        modelId: engine.carModel.id,
        carBrand: engine.carBrand,
        carModel: engine.carModel,
        engines: [engine],
        yearStart: engine.yearStart,
        yearEnd: engine.yearEnd,
      });
      continue;
    }

    group.engines.push(engine);
    group.yearStart = Math.min(group.yearStart, engine.yearStart);
    // One engine still in production leaves the whole model's span open-ended —
    // capping it at another engine's end year would date the model to a year it
    // is still being sold in.
    group.yearEnd =
      group.yearEnd === null || engine.yearEnd === null
        ? null
        : Math.max(group.yearEnd, engine.yearEnd);
  }

  return Array.from(groups.values());
}

// The engines under a model heading. With one engine the heading's span already
// carries the years, so repeating them reads as a stutter; with several, each
// one's own range is usually the only thing telling them apart.
export function formatGroupEngineLabels(locale: Locale, group: FittingVehicleGroup): string[] {
  return group.engines.map((engine) => {
    const name = pickLocale(locale, engine.labelEn, engine.labelFa);
    return group.engines.length === 1 ? name : `${name} (${formatYearSpan(locale, engine)})`;
  });
}

export function groupContainsEngine(group: FittingVehicleGroup, carEngineId: string): boolean {
  return group.engines.some((engine) => engine.carEngineId === carEngineId);
}

// --- Specifications --------------------------------------------------------

export interface ProductSpecRow {
  label: string;
  value: string;
}

/** The three structured spec columns, as they read on the page. */
export interface ProductSpecParts {
  viscosity: string | null;
  apiGrade: string | null;
  volumeMl: number | null;
}

// "4 L" / "۴ لیتر", "500 ml" / "۵۰۰ میلی‌لیتر". Litres only when the millilitres
// divide evenly — a 3,785 ml US gallon reads worse as "3.785 L" than as itself.
export function formatVolume(locale: Locale, volumeMl: number): string {
  if (volumeMl >= 1000 && volumeMl % 1000 === 0) {
    return `${formatNumber(volumeMl / 1000, locale)} ${pickLocale(locale, "L", "لیتر")}`;
  }
  return `${formatNumber(volumeMl, locale)} ${pickLocale(locale, "ml", "میلی‌لیتر")}`;
}

// Whichever specs the product actually carries, in a fixed order — viscosity
// first, because that's the one a customer came to check. A column that's null
// (or blank, which an import can still produce) is simply not a row, and a
// product with none of them yields an empty list: the page renders no section
// at all rather than a heading over nothing.
export function formatProductSpecs(locale: Locale, product: ProductSpecParts): ProductSpecRow[] {
  const rows: ProductSpecRow[] = [];

  const viscosity = product.viscosity?.trim();
  if (viscosity) {
    rows.push({ label: pickLocale(locale, "Viscosity", "گرانروی"), value: viscosity });
  }

  const apiGrade = product.apiGrade?.trim();
  if (apiGrade) {
    rows.push({ label: pickLocale(locale, "API grade", "درجه API"), value: apiGrade });
  }

  if (product.volumeMl !== null && product.volumeMl > 0) {
    rows.push({
      label: pickLocale(locale, "Volume", "حجم"),
      value: formatVolume(locale, product.volumeMl),
    });
  }

  return rows;
}
