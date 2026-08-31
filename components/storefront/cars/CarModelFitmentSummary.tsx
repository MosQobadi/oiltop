import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import type { FitmentCategoryGroup, SharedFitmentProfile } from "@/lib/services/fitment";
import {
  climateColumnLabel,
  FITMENT_CARDS_PER_SECTION,
  formatEngineOptionLabel,
  formatSpecSummary,
  formatYearSpan,
  partitionFitmentGroups,
  splitItemsByClimate,
} from "@/lib/storefront/fitment";

// A fitment profile that covers most of a model's year range, written out as
// prose the page can be read for — "Recommended oil for the 2006–2016 X6: …".
// The point of Task 10.3 is that this answer exists in the HTML of a page a
// search engine can rank, rather than only behind four `<select>`s.
//
// So this is deliberately not FitmentResults: no product cards, no prices, no
// "Request it" form. Those belong to the results screen, where a customer has
// named their exact engine and is ready to buy. Here the same data is a
// definition list — category on the left, what fits on the right.

export interface CarModelFitmentSummaryProps {
  locale: Locale;
  /** "BMW X6" — the profile's span plus this is the heading. */
  modelName: string;
  profile: SharedFitmentProfile;
  className?: string;
}

export function CarModelFitmentSummary({
  locale,
  modelName,
  profile,
  className = "",
}: CarModelFitmentSummaryProps) {
  // The six primary categories only. An imported profile also carries the car's
  // brake pads, coolant and air fresheners, and a paragraph headed "Recommended
  // oil and filters" is not where a customer goes looking for those — the
  // results screen's "Show more" is.
  const groups = partitionFitmentGroups(profile.groups).primary;
  const span = formatYearSpan(locale, profile.span);

  // A profile that recommends nothing but oil says "oil"; one that also carries
  // filters can't, and claiming otherwise in an <h2> is the kind of thing a
  // reader notices. Read off `partType`, never the category's name (CLAUDE.md).
  const oilOnly = groups.every((group) => group.category.partType === "ENGINE_OIL");
  const what = oilOnly
    ? pickLocale(locale, "oil", "روغن")
    : pickLocale(locale, "oil and filters", "روغن و فیلتر");

  return (
    <section
      data-testid="car-model-fitment-summary"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 ${className}`}
    >
      <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-neutral-900">
        {pickLocale(
          locale,
          `Recommended ${what} for the ${span} ${modelName}`,
          `${what} پیشنهادی برای ${modelName} ${span}`,
        )}
      </h2>

      {/* The span above is a claim about which cars this covers, so the engines
          behind it are named rather than left to be taken on trust. */}
      <p dir="auto" className="mt-1.5 text-[13px] text-neutral-500">
        {pickLocale(locale, "Applies to", "برای")}:{" "}
        {profile.engines.map((engine) => formatEngineOptionLabel(locale, engine)).join(" · ")}
      </p>

      <dl className="mt-5 border-t border-neutral-200">
        {groups.map((group) => (
          <CategoryRow key={group.category.id} locale={locale} group={group} />
        ))}
      </dl>
    </section>
  );
}

function CategoryRow({ locale, group }: { locale: Locale; group: FitmentCategoryGroup }) {
  const { standard, hot, cold } = splitItemsByClimate(group.items);

  // HOT and COLD are co-equal options rather than a ranking, so each gets its
  // own labelled line; STANDARD needs no label because there's nothing to tell
  // it apart from.
  const lines = [
    { key: "standard", label: null, items: standard },
    { key: "hot", label: climateColumnLabel(locale, "HOT"), items: hot },
    { key: "cold", label: climateColumnLabel(locale, "COLD"), items: cold },
  ]
    .map((line) => ({ ...line, entries: renderableEntries(locale, line.items) }))
    .filter((line) => line.entries.length > 0);

  // Every item in the category was a spec with nothing filled in — there is no
  // recommendation to print, so the category doesn't get a row.
  if (lines.length === 0) return null;

  return (
    <div className="grid gap-1 border-b border-neutral-200 py-3.5 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13.5px] font-medium text-neutral-900">
        {pickLocale(locale, group.category.nameEn, group.category.nameFa)}
      </dt>
      <dd className="flex flex-col gap-1 text-[14px] text-neutral-600">
        {lines.map((line) => (
          <p key={line.key} dir="auto">
            {line.label && <span className="text-neutral-500">{line.label}: </span>}
            {line.entries.slice(0, FITMENT_CARDS_PER_SECTION).map((entry, index) => (
              <Fragment key={entry.id}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {entry.node}
              </Fragment>
            ))}
            {/* oil-city's own page for a 206 names 44 acceptable oils. Four is
                the answer; the count is what says the rest exist. */}
            {line.entries.length > FITMENT_CARDS_PER_SECTION && (
              <span className="text-neutral-500">
                {" "}
                {pickLocale(
                  locale,
                  `and ${formatDigits(line.entries.length - FITMENT_CARDS_PER_SECTION, locale)} more`,
                  `و ${formatDigits(line.entries.length - FITMENT_CARDS_PER_SECTION, locale)} مورد دیگر`,
                )}
              </span>
            )}
          </p>
        ))}
      </dd>
    </div>
  );
}

// A recommendation reads as either a link to the product that satisfies it or,
// where the catalog has no match yet, the spec itself. An item that is neither
// (no product, and an admin who filled in no spec) is dropped: a bullet with
// nothing after it is worse than a shorter list.
function renderableEntries(
  locale: Locale,
  items: FitmentCategoryGroup["items"],
): { id: string; node: ReactNode }[] {
  return items.flatMap((item) => {
    // Several, where the item is a spec rather than a pinned product: each
    // match is its own entry on the line, separated by the same "·".
    if (item.products.length > 0) {
      return item.products.map((product) => ({
        id: `${item.id}:${product.id}`,
        node: (
          <Link
            href={navHref(locale, `${PRODUCTS_PATH}/${product.slug}`)}
            className="focus-visible:ring-accent hover:text-accent rounded font-medium text-neutral-900 underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {pickLocale(locale, product.nameEn, product.nameFa)}
          </Link>
        ),
      }));
    }

    const spec = formatSpecSummary(item);
    if (!spec) return [];

    return [
      {
        id: item.id,
        // Said plainly rather than dressed as a product: this is what the engine
        // needs, and the shop can't sell it yet.
        node: (
          <span>
            {spec}{" "}
            <span className="text-neutral-400">
              ({pickLocale(locale, "not stocked yet", "هنوز موجود نیست")})
            </span>
          </span>
        ),
      },
    ];
  });
}
