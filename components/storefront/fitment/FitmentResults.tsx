import type { ReactNode } from "react";
import { SpecOnlyCard } from "./SpecOnlyCard";
import { ProductCard } from "../ProductCard";
import { pickLocale, type Locale } from "@/lib/i18n";
import type {
  CarEngineContext,
  FitmentCategoryGroup,
  FitmentResolvedItem,
} from "@/lib/services/fitment";
import {
  climateColumnLabel,
  formatCarLabel,
  sortFitmentGroups,
  splitItemsByClimate,
} from "@/lib/storefront/fitment";

// What the car finder resolved, rendered. One section per category, in the
// order the design brief lists them (Engine Oil, then the filters) rather than
// the order the admin happened to enter the profile's items.
//
// Three shapes live inside a section and all three are answers, not fallbacks:
// a single product, several co-equal products (two acceptable filter brands are
// options, not a ranking), and a HOT/COLD pair shown side by side. A spec-only
// item — the catalog has no match yet — renders as SpecOnlyCard in the same
// grid, so a category is never silently empty.
//
// No "use client": this is presentational and every card below it takes its own
// props, so a Server Component renders the whole tree and only the interactive
// leaves (add-to-cart, the request disclosure) ship as client components.

export interface FitmentResultsProps {
  locale: Locale;
  car: CarEngineContext;
  groups: FitmentCategoryGroup[];
  className?: string;
}

// Cards sit in a two- or three-up grid here, never the PLP's four-up, so the
// image request is a size wider than the default.
const FITMENT_IMAGE_SIZES = "(min-width: 1024px) 300px, (min-width: 640px) 42vw, 84vw";

export function FitmentResults({ locale, car, groups, className = "" }: FitmentResultsProps) {
  const carLabel = formatCarLabel(locale, car);

  if (groups.length === 0) {
    return (
      <div data-testid="fitment-results" className={className}>
        <SpecOnlyCard
          locale={locale}
          carLabel={carLabel}
          categoryName={null}
          specNote={null}
          specAttributes={null}
          className="max-w-xl"
        />
      </div>
    );
  }

  return (
    <div data-testid="fitment-results" className={`flex flex-col gap-10 ${className}`}>
      {sortFitmentGroups(groups).map((group) => (
        <CategorySection
          key={group.category.id}
          locale={locale}
          carLabel={carLabel}
          group={group}
        />
      ))}
    </div>
  );
}

function CategorySection({
  locale,
  carLabel,
  group,
}: {
  locale: Locale;
  carLabel: string;
  group: FitmentCategoryGroup;
}) {
  const categoryName = pickLocale(locale, group.category.nameEn, group.category.nameFa);
  const { standard, hot, cold } = splitItemsByClimate(group.items);
  const hasClimatePair = hot.length > 0 && cold.length > 0;
  const climateItems = [...hot, ...cold];

  const renderItem = (item: FitmentResolvedItem): ReactNode =>
    item.product ? (
      <ProductCard
        key={item.id}
        locale={locale}
        product={item.product}
        imageSizes={FITMENT_IMAGE_SIZES}
      />
    ) : (
      <SpecOnlyCard
        key={item.id}
        locale={locale}
        carLabel={carLabel}
        categoryName={categoryName}
        specNote={item.specNote}
        specAttributes={item.specAttributes}
      />
    );

  return (
    <section data-testid="fitment-category" data-category={group.category.partType}>
      <div className="border-t border-neutral-200 pt-6">
        <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-neutral-900">
          {categoryName}
        </h2>

        {/* Only said when both grades are actually offered — with one climate
            variant there is no choice to explain. */}
        {hasClimatePair && (
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-neutral-500">
            {pickLocale(
              locale,
              "Two valid options for this engine. The manufacturer approves either grade — pick the one that matches where the car actually lives.",
              "دو گزینه‌ی مجاز برای این موتور. سازنده هر دو گرید را تأیید کرده است — بر اساس اقلیمی که خودرو در آن کار می‌کند انتخاب کنید.",
            )}
          </p>
        )}
      </div>

      {climateItems.length > 0 && (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {hot.length > 0 && (
            <ClimateColumn locale={locale} climate="HOT" items={hot} renderItem={renderItem} />
          )}
          {cold.length > 0 && (
            <ClimateColumn locale={locale} climate="COLD" items={cold} renderItem={renderItem} />
          )}
        </div>
      )}

      {standard.length > 0 && (
        <div
          className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${climateItems.length > 0 ? "mt-5" : "mt-4"}`}
        >
          {standard.map(renderItem)}
        </div>
      )}
    </section>
  );
}

const CLIMATE_PILL: Record<"HOT" | "COLD", string> = {
  HOT: "bg-[oklch(0.96_0.03_45)] text-accent",
  COLD: "bg-[oklch(0.96_0.03_240)] text-[oklch(0.42_0.11_250)]",
};

// A climate is a column, not a badge on a card: both columns are on screen at
// once and each stacks however many co-equal items that climate has.
function ClimateColumn({
  locale,
  climate,
  items,
  renderItem,
}: {
  locale: Locale;
  climate: "HOT" | "COLD";
  items: FitmentResolvedItem[];
  renderItem: (item: FitmentResolvedItem) => ReactNode;
}) {
  return (
    <div data-testid="fitment-climate-column" data-climate={climate}>
      <span
        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[12.5px] font-medium ${CLIMATE_PILL[climate]}`}
      >
        {climateColumnLabel(locale, climate)}
      </span>
      <div className="mt-3 flex flex-col gap-4">{items.map(renderItem)}</div>
    </div>
  );
}
