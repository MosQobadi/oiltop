import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { formatYearSpan } from "@/lib/storefront/fitment";
import {
  formatGroupEngineLabels,
  groupContainsEngine,
  type FittingVehicleGroup,
} from "@/lib/storefront/pdp";

// "This fits: Peugeot 206 (2001–2010), Peugeot 405…" — every car a Fitment
// Profile recommends this product for, one row per model rather than one per
// engine (see `groupFittingEnginesByModel` for why).
//
// The list is a summary that can still run long — an oil that suits thirty
// models is a normal catalog entry, not an edge case — so only the first few
// rows are open and the rest sit behind a native `<details>`. No `"use client"`
// for a disclosure the browser already implements, and the collapsed rows are
// still in the HTML, so a search engine reads the whole list.

export interface CompatibleVehiclesProps {
  locale: Locale;
  groups: FittingVehicleGroup[];
  /** The car from `?fit=`, if any — its row is called out in the list. */
  highlightCarEngineId?: string | null;
  className?: string;
}

const VISIBLE_GROUPS = 6;

export function CompatibleVehicles({
  locale,
  groups,
  highlightCarEngineId = null,
  className = "",
}: CompatibleVehiclesProps) {
  if (groups.length === 0) return null;

  // A highlighted row belongs where a customer can see it without opening
  // anything: their own car is the one row on this list they came for.
  const ordered =
    highlightCarEngineId === null
      ? groups
      : [
          ...groups.filter((group) => groupContainsEngine(group, highlightCarEngineId)),
          ...groups.filter((group) => !groupContainsEngine(group, highlightCarEngineId)),
        ];

  const visible = ordered.slice(0, VISIBLE_GROUPS);
  const hidden = ordered.slice(VISIBLE_GROUPS);

  const renderGroup = (group: FittingVehicleGroup) => (
    <VehicleRow
      key={group.modelId}
      locale={locale}
      group={group}
      isYourCar={highlightCarEngineId !== null && groupContainsEngine(group, highlightCarEngineId)}
    />
  );

  return (
    <section data-testid="compatible-vehicles" className={className}>
      <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-neutral-900">
        {pickLocale(locale, "Compatible vehicles", "خودروهای سازگار")}
      </h2>
      <p className="mt-2 max-w-[65ch] text-[13.5px] text-neutral-500">
        {pickLocale(
          locale,
          "Cars we've matched this part to. Fitment data is advisory — always confirm against your owner's manual.",
          "خودروهایی که این قطعه برایشان ثبت شده است. این اطلاعات جنبه‌ی راهنما دارد — همیشه با دفترچه‌ی خودرو مطابقت دهید.",
        )}
      </p>

      <ul className="mt-4 border-t border-neutral-200">{visible.map(renderGroup)}</ul>

      {hidden.length > 0 && (
        <details className="group">
          <summary className="focus-visible:ring-accent hover:text-accent text-accent inline-flex min-h-11 cursor-pointer items-center rounded text-[13.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <span className="group-open:hidden">
              {pickLocale(
                locale,
                `Show ${hidden.length} more`,
                `نمایش ${formatDigits(hidden.length, locale)} مورد دیگر`,
              )}
            </span>
            <span className="hidden group-open:inline">
              {pickLocale(locale, "Show fewer", "نمایش کمتر")}
            </span>
          </summary>
          <ul className="border-t border-neutral-200">{hidden.map(renderGroup)}</ul>
        </details>
      )}
    </section>
  );
}

function VehicleRow({
  locale,
  group,
  isYourCar,
}: {
  locale: Locale;
  group: FittingVehicleGroup;
  isYourCar: boolean;
}) {
  const brand = pickLocale(locale, group.carBrand.nameEn, group.carBrand.nameFa);
  const model = pickLocale(locale, group.carModel.nameEn, group.carModel.nameFa);

  return (
    <li
      data-testid="compatible-vehicle"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-200 py-3"
    >
      <p dir="auto" className="text-[14.5px] font-medium text-neutral-900">
        {brand} {model}
      </p>
      <span className="font-mono text-[12px] tracking-[0.02em] text-neutral-500">
        {formatYearSpan(locale, group)}
      </span>

      {isYourCar && (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
          {pickLocale(locale, "Your car", "خودروی شما")}
        </span>
      )}

      <p dir="auto" className="w-full text-[13px] text-neutral-500">
        {formatGroupEngineLabels(locale, group).join(pickLocale(locale, ", ", "، "))}
      </p>
    </li>
  );
}
