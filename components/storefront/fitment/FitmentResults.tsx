import type { ReactNode } from "react";
import { SpecOnlyCard } from "./SpecOnlyCard";
import { CATEGORY_ICONS, GridIcon } from "../icons";
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
// The sections themselves are laid out on one shared three-column grid rather
// than stacked full-width, and this is the whole reason for the span
// arithmetic below. The common result is five categories holding one product
// each: stacked, that is five lonely cards down the left edge of a desktop
// screen and three metres of scroll. On the shared grid the same five pack into
// two rows, while a category that genuinely has more to say (a HOT/COLD pair, a
// set of co-equal filters) claims the width it needs.
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
const FITMENT_IMAGE_SIZES = "(min-width: 1024px) 370px, (min-width: 640px) 46vw, 90vw";

// How many of the results grid's columns a section takes, and how its own cards
// divide that up. Both are keyed on the number of cards the section holds, so a
// card is the same width wherever it lands: a section never stretches one card
// across three columns, and never squeezes three into one.
//
// Static class strings, not interpolation — Tailwind only ships the classes it
// can find in the source.
const GRID_COLUMNS = 3;

const SECTION_SPAN: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

const CARD_COLUMNS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
};

// One item is one card, except a spec-based item, which resolves to every
// product that currently matches — see `renderItem`.
function countCards(items: FitmentResolvedItem[]): number {
  return items.reduce((count, item) => count + Math.max(1, item.products.length), 0);
}

function clampColumns(count: number): number {
  return Math.min(GRID_COLUMNS, Math.max(1, count));
}

export function FitmentResults({ locale, car, groups, className = "" }: FitmentResultsProps) {
  const carLabel = formatCarLabel(locale, car);

  if (groups.length === 0) {
    return (
      <div data-testid="fitment-results" className={className}>
        <SpecOnlyCard
          locale={locale}
          carLabel={carLabel}
          carEngineId={car.carEngine.id}
          categoryId={null}
          categoryName={null}
          specNote={null}
          specAttributes={null}
          className="max-w-xl"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="fitment-results"
      className={`grid items-start gap-x-5 gap-y-9 lg:grid-cols-3 ${className}`}
    >
      {sortFitmentGroups(groups).map((group) => (
        <CategorySection
          key={group.category.id}
          locale={locale}
          carLabel={carLabel}
          carEngineId={car.carEngine.id}
          group={group}
        />
      ))}
    </div>
  );
}

function CategorySection({
  locale,
  carLabel,
  carEngineId,
  group,
}: {
  locale: Locale;
  carLabel: string;
  carEngineId: string;
  group: FitmentCategoryGroup;
}) {
  const categoryName = pickLocale(locale, group.category.nameEn, group.category.nameFa);
  const Icon = CATEGORY_ICONS[group.category.slug] ?? GridIcon;
  const { standard, hot, cold } = splitItemsByClimate(group.items);
  const hasClimatePair = hot.length > 0 && cold.length > 0;
  const climateItems = [...hot, ...cold];

  // A climate pair is two columns whatever it holds — that side-by-side reading
  // is the point of it, so it sets a floor the card count can only raise.
  const span = clampColumns(Math.max(countCards(group.items), hasClimatePair ? 2 : 1));

  // One item can be several cards: a spec-based item resolves to every product
  // that currently matches, and those are co-equal options in the same grid —
  // exactly what the multi-product case above already looked like. An item with
  // nothing to show is still one card, the spec-only one.
  const renderItem = (item: FitmentResolvedItem): ReactNode[] =>
    item.products.length > 0
      ? item.products.map((product) => (
          <ProductCard
            key={`${item.id}:${product.id}`}
            locale={locale}
            product={product}
            imageSizes={FITMENT_IMAGE_SIZES}
            imageBox="tall"
          />
        ))
      : [
          <SpecOnlyCard
            key={item.id}
            locale={locale}
            carLabel={carLabel}
            carEngineId={carEngineId}
            categoryId={group.category.id}
            categoryName={categoryName}
            specNote={item.specNote}
            specAttributes={item.specAttributes}
          />,
        ];

  return (
    <section
      data-testid="fitment-category"
      data-category={group.category.partType}
      className={SECTION_SPAN[span]}
    >
      <div className="border-t border-neutral-200 pt-4">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em] text-neutral-900">
          <Icon aria-hidden="true" className="text-accent h-[18px] w-[18px] shrink-0" />
          {categoryName}
        </h2>

        {/* Only said when both grades are actually offered — with one climate
            variant there is no choice to explain. */}
        {hasClimatePair && (
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-neutral-500">
            {pickLocale(
              locale,
              "Two valid options for this engine. The manufacturer approves either grade — pick the one that matches where the car actually lives.",
              "دو گزینه‌ی مجاز برای این موتور. سازنده هر دو گرید را تأیید کرده است — بر اساس اقلیمی که خودرو در آن کار می‌کند انتخاب کنید.",
            )}
          </p>
        )}
      </div>

      {/* The pair takes the section's own columns rather than a hard two-up, so
          in a three-wide section the HOT and COLD cards line up with the
          standard ones underneath instead of being a size larger than them. */}
      {climateItems.length > 0 && (
        <div className={`mt-4 grid gap-5 ${CARD_COLUMNS[span]}`}>
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
          className={`mt-4 grid gap-5 ${CARD_COLUMNS[clampColumns(Math.min(countCards(standard), span))]}`}
        >
          {standard.flatMap(renderItem)}
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
  renderItem: (item: FitmentResolvedItem) => ReactNode[];
}) {
  return (
    <div data-testid="fitment-climate-column" data-climate={climate}>
      <span
        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[12.5px] font-medium ${CLIMATE_PILL[climate]}`}
      >
        {climateColumnLabel(locale, climate)}
      </span>
      <div className="mt-3 flex flex-col gap-5">{items.flatMap(renderItem)}</div>
    </div>
  );
}
