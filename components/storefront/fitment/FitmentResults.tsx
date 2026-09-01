import type { ReactNode } from "react";
import { FitmentCardRail } from "./FitmentCardRail";
import { SpecOnlyCard } from "./SpecOnlyCard";
import { CATEGORY_ICONS, GridIcon } from "../icons";
import { FITMENT_PATH, navHref } from "../nav-items";
import { ProductCard } from "../ProductCard";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import type {
  CarEngineContext,
  FitmentCategoryGroup,
  FitmentResolvedItem,
} from "@/lib/services/fitment";
import {
  climateColumnLabel,
  clipFitmentItems,
  countFitmentCards,
  deriveClimateByViscosity,
  FITMENT_CARDS_PER_SECTION,
  formatCarLabel,
  partitionFitmentGroups,
  splitItemsByClimate,
  withFitCategory,
  withFitContext,
} from "@/lib/storefront/fitment";

// What the car finder resolved, rendered — and, just as much, what it does NOT
// render. An imported car resolves to a lot: oil-city's page for a Peugeot 206
// names 44 acceptable engine oils on its own, and every one of them is a real
// recommendation. Three rules turn that into an answer:
//
//   1. **Six categories are the page.** Engine oil, gearbox oil, and the four
//      filters — the maintenance the customer came for. Everything else the car
//      resolves to (brake pads, coolant, additives, air fresheners) is real and
//      is kept, one "Show more" away.
//   2. **Four cards a section.** Past four near-identical oils the customer is
//      being asked to shop rather than being told what fits, and a "See all 44"
//      link into this same page's single-category view is where shopping goes.
//   3. **Two columns where the grades say so.** A car whose approved oils span
//      a 5W and a 10W is a car with a hot answer and a cold answer, and those
//      are shown side by side rather than interleaved in one run of cards.
//
// Three shapes live inside a section and all three are answers, not fallbacks:
// a single product, several co-equal products (two acceptable filter brands are
// options, not a ranking), and a HOT/COLD pair. A spec-only item — the catalog
// has no match yet — renders as SpecOnlyCard in the same grid, so a category is
// never silently empty.
//
// The sections are laid out on one shared three-column grid rather than
// stacked full-width, which is the reason for the span arithmetic below. The
// common result is five categories holding one product each: stacked, that is
// five lonely cards down the left edge of a desktop screen and three metres of
// scroll. On the shared grid the same five pack into two rows, while a category
// that genuinely has more to say claims the width it needs.
//
// No "use client": this is presentational, the "Show more" zone is a native
// <details>, and every card takes its own props — so a Server Component renders
// the whole tree and only the interactive leaves (add-to-cart, the request
// disclosure) ship as client components.

export interface FitmentResultsProps {
  locale: Locale;
  car: CarEngineContext;
  groups: FitmentCategoryGroup[];
  /**
   * Set by the single-category view (`?category=<slug>`): render only this
   * category, uncapped. Undefined is the normal results page.
   */
  onlyCategorySlug?: string;
  className?: string;
}

// Cards sit in a two- or three-up grid here, never the PLP's four-up, so the
// image request is a size wider than the default — except on a phone, where a
// multi-card section is a rail of 62vw cards rather than one full-width column.
const FITMENT_IMAGE_SIZES = "(min-width: 1024px) 370px, (min-width: 640px) 46vw, 62vw";

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

// How wide a card is on a phone, rail or no rail. Narrow enough that the second
// one in a rail is visibly cut off rather than merely close to the edge — the
// cut is the only affordance a touch rail gets — and applied to a lone card too,
// so a category answered by one product and one answered by four put the same
// card on the page.
//
// The `sm:` half gives every mobile-only measurement back, or it leaks into the
// grid: `flex-none` is inert there but the widths are not.
//
// It lives here, with the other layout constants, and is passed to the rail
// rather than exported from it: the rail is a Client Component, and a constant
// exported from one of those reaches a Server Component as a client reference,
// not a string.
const CARD_WIDTH = "w-[62vw] max-w-[240px] min-w-[168px] sm:w-auto sm:max-w-none sm:min-w-0";

const CARD_COLUMNS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
};

function clampColumns(count: number): number {
  return Math.min(GRID_COLUMNS, Math.max(1, count));
}

const RESULTS_GRID = "grid items-start gap-x-5 gap-y-9 lg:grid-cols-3";

export function FitmentResults({
  locale,
  car,
  groups,
  onlyCategorySlug,
  className = "",
}: FitmentResultsProps) {
  const carLabel = formatCarLabel(locale, car);
  const carEngineId = car.carEngine.id;

  // The whole-car empty state: no profile is attached to this type at all, so
  // there is not even a category to be empty. One request card, not six.
  if (groups.length === 0) {
    return (
      <div data-testid="fitment-results" className={className}>
        <SpecOnlyCard
          locale={locale}
          carLabel={carLabel}
          carEngineId={carEngineId}
          categoryId={null}
          categoryName={null}
          specNote={null}
          specAttributes={null}
          className="max-w-xl"
        />
      </div>
    );
  }

  const { primary, secondary } = partitionFitmentGroups(groups);

  if (onlyCategorySlug !== undefined) {
    // Searched in the partition, not in `groups` — a hand-edited `?category=`
    // must not reach a category the results page itself declines to show.
    const group = [...primary, ...secondary].find(
      (entry) => entry.category.slug === onlyCategorySlug,
    );
    return (
      <div data-testid="fitment-results" className={className}>
        {group ? (
          <div className={RESULTS_GRID}>
            <CategorySection
              locale={locale}
              carLabel={carLabel}
              carEngineId={carEngineId}
              group={group}
              limit={null}
            />
          </div>
        ) : (
          <p className="text-[14px] text-neutral-500">
            {pickLocale(
              locale,
              "We have nothing in that category for this car.",
              "در این دسته‌بندی چیزی برای این خودرو نداریم.",
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="fitment-results" className={className}>
      <div className={RESULTS_GRID}>
        {primary.map((group) => (
          <CategorySection
            key={group.category.id}
            locale={locale}
            carLabel={carLabel}
            carEngineId={carEngineId}
            group={group}
            limit={FITMENT_CARDS_PER_SECTION}
          />
        ))}
      </div>

      {secondary.length > 0 && (
        <SecondaryZone
          locale={locale}
          carLabel={carLabel}
          carEngineId={carEngineId}
          groups={secondary}
        />
      )}
    </div>
  );
}

// Everything the car resolves to that isn't one of the six. A native <details>
// rather than a toggle: it needs no client component, it is open to a keyboard
// and a screen reader without help, and a browser's in-page find can open it.
function SecondaryZone({
  locale,
  carLabel,
  carEngineId,
  groups,
}: {
  locale: Locale;
  carLabel: string;
  carEngineId: string;
  groups: FitmentCategoryGroup[];
}) {
  return (
    <details data-testid="fitment-secondary" className="group mt-12">
      <summary className="focus-visible:ring-accent/40 flex w-full cursor-pointer list-none items-center justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3.5 text-[14px] font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span>
          {pickLocale(
            locale,
            "Other parts and accessories for this car",
            "سایر قطعات و لوازم جانبی این خودرو",
          )}
          {/* The space is literal, not just the margin: a screen reader reads
              the text nodes, and "for this car6" is what it would otherwise say. */}{" "}
          <span className="ms-1 text-neutral-400">{formatDigits(groups.length, locale)}</span>
        </span>
        <span
          aria-hidden="true"
          className="text-neutral-400 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className={`mt-8 ${RESULTS_GRID}`}>
        {groups.map((group) => (
          <CategorySection
            key={group.category.id}
            locale={locale}
            carLabel={carLabel}
            carEngineId={carEngineId}
            group={group}
            limit={FITMENT_CARDS_PER_SECTION}
          />
        ))}
      </div>
    </details>
  );
}

function CategorySection({
  locale,
  carLabel,
  carEngineId,
  group,
  limit,
}: {
  locale: Locale;
  carLabel: string;
  carEngineId: string;
  group: FitmentCategoryGroup;
  /** Cards per column, or null on the single-category view, which shows them all. */
  limit: number | null;
}) {
  const categoryName = pickLocale(locale, group.category.nameEn, group.category.nameFa);
  const Icon = CATEGORY_ICONS[group.category.slug] ?? GridIcon;

  // Authored climate wins; a derived split only ever happens on an all-STANDARD
  // section, and `derived` is what stops the page attributing our reading of the
  // grades to the car's manufacturer.
  const placed = deriveClimateByViscosity(group.items);
  const derived = placed !== null;
  const { standard, hot, cold } = splitItemsByClimate(placed ?? group.items);
  const hasClimatePair = hot.length > 0 && cold.length > 0;

  // Each column is capped on its own, so a hot/cold pair is four and four —
  // "four engine oils for each" is the whole point of splitting it.
  const clip = <T extends FitmentResolvedItem>(items: T[]) =>
    limit === null ? { items, total: countFitmentCards(items) } : clipFitmentItems(items, limit);

  const shownStandard = clip(standard);
  const shownHot = clip(hot);
  const shownCold = clip(cold);

  const shownCards =
    countFitmentCards(shownStandard.items) +
    countFitmentCards(shownHot.items) +
    countFitmentCards(shownCold.items);
  const totalCards = shownStandard.total + shownHot.total + shownCold.total;

  // A climate pair is two columns whatever it holds — that side-by-side reading
  // is the point of it, so it sets a floor the card count can only raise.
  const span = clampColumns(Math.max(shownCards, hasClimatePair ? 2 : 1));

  // One item can be several cards: a spec-based item resolves to every product
  // that currently matches, and those are co-equal options in the same grid.
  // An item with nothing to show is still one card, the spec-only one.
  const renderItem = (item: FitmentResolvedItem): ReactNode[] =>
    item.products.length > 0
      ? item.products.map((product) => (
          <ProductCard
            key={`${item.id}:${product.id}`}
            locale={locale}
            product={product}
            imageSizes={FITMENT_IMAGE_SIZES}
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
      data-category-slug={group.category.slug}
      // `min-w-0`, because a grid item's automatic minimum size is its
      // content's — which on a phone is a rail wide enough to hold every card
      // in the section. Without it the section grows to that width instead of
      // letting the rail scroll, and takes the whole page's layout with it.
      className={`min-w-0 ${SECTION_SPAN[span]}`}
    >
      <div className="border-t border-neutral-200 pt-4">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em] text-neutral-900">
          <Icon aria-hidden="true" className="text-accent h-[18px] w-[18px] shrink-0" />
          {categoryName}
        </h2>

        {/* Only said when both grades are actually offered — with one climate
            variant there is no choice to explain. Which sentence depends on who
            made the split: a manufacturer approval is a claim about the engine,
            and we are not entitled to make it on their behalf when all we did
            was read the grades off the oils. */}
        {hasClimatePair && (
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-neutral-500">
            {derived
              ? pickLocale(
                  locale,
                  "Every oil here fits this engine. They're grouped by their cold-start grade — pick the one that matches where the car actually lives.",
                  "همه‌ی این روغن‌ها برای این موتور مناسب‌اند و بر اساس گرید سرماخیزی دسته‌بندی شده‌اند — بر اساس اقلیمی که خودرو در آن کار می‌کند انتخاب کنید.",
                )
              : pickLocale(
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
      {(shownHot.items.length > 0 || shownCold.items.length > 0) && (
        <div className={`mt-4 grid gap-5 ${CARD_COLUMNS[span]}`}>
          {shownHot.items.length > 0 && (
            <ClimateColumn
              locale={locale}
              categoryName={categoryName}
              climate="HOT"
              items={shownHot.items}
              renderItem={renderItem}
            />
          )}
          {shownCold.items.length > 0 && (
            <ClimateColumn
              locale={locale}
              categoryName={categoryName}
              climate="COLD"
              items={shownCold.items}
              renderItem={renderItem}
            />
          )}
        </div>
      )}

      {shownStandard.items.length > 0 && (
        <CardGroup
          className="mt-4"
          label={categoryName}
          restLayout={`sm:grid ${CARD_COLUMNS[clampColumns(Math.min(countFitmentCards(shownStandard.items), span))]}`}
          cards={shownStandard.items.flatMap(renderItem)}
        />
      )}

      {totalCards > shownCards && (
        <p className="mt-4 text-end">
          <a
            data-testid="fitment-see-all"
            href={withFitCategory(
              withFitContext(navHref(locale, FITMENT_PATH), carEngineId),
              group.category.slug,
            )}
            className="text-accent text-[13.5px] font-medium hover:underline"
          >
            {pickLocale(
              locale,
              `See all ${formatDigits(totalCards, locale)} →`,
              `مشاهده هر ${formatDigits(totalCards, locale)} مورد ←`,
            )}
          </a>
        </p>
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
  categoryName,
  climate,
  items,
  renderItem,
}: {
  locale: Locale;
  categoryName: string;
  climate: "HOT" | "COLD";
  items: FitmentResolvedItem[];
  renderItem: (item: FitmentResolvedItem) => ReactNode[];
}) {
  const label = climateColumnLabel(locale, climate);

  return (
    // `min-w-0` for the same reason as the section above: this is a grid item
    // too, and the rail inside it is wider than the column.
    <div data-testid="fitment-climate-column" data-climate={climate} className="min-w-0">
      <span
        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[12.5px] font-medium ${CLIMATE_PILL[climate]}`}
      >
        {label}
      </span>
      {/* A column from `sm` up — the rail only ever replaces it on a phone. */}
      <CardGroup
        className="mt-3"
        label={`${categoryName} — ${label}`}
        restLayout="sm:flex-col"
        cards={items.flatMap(renderItem)}
      />
    </div>
  );
}

// One card is not a rail: there is nothing to swipe to, so it renders as the
// plain block it always did — at the rail's card width, so that a category
// answered by one product and one answered by four put the same-sized card on
// the page. Only the scrolling is conditional, never the card.
function CardGroup({
  className,
  label,
  restLayout,
  cards,
}: {
  className: string;
  label: string;
  restLayout: string;
  cards: ReactNode[];
}) {
  if (cards.length < 2) {
    return <div className={`${className} grid gap-5 ${CARD_WIDTH}`}>{cards}</div>;
  }

  return (
    <FitmentCardRail
      className={className}
      label={label}
      restLayout={restLayout}
      cardWidthClass={CARD_WIDTH}
      cards={cards}
    />
  );
}
