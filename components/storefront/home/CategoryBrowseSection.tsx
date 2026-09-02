import Image from "next/image";
import Link from "next/link";
import { ChevronIcon } from "../icons";
import { categoryHref, navHref, PRODUCTS_PATH } from "../nav-items";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontCategory } from "@/lib/services/catalog";

// The escape hatch from the car-finder: a customer who already knows they want
// air filters shouldn't have to answer four questions about their car first.
// Each card goes to that category's landing page rather than a pre-filtered PLP
// URL — same grid either way, but the landing page is the one with the copy and
// the SEO pair, and linking it from the homepage is what keeps it crawlable.
//
// Twenty-one active shelves is not a homepage. Nine lead, the rest open behind
// "Show more" — the same two-zone shape a car's results page uses, and for the
// same reason: everything is still here, but the fold belongs to what a
// customer actually came to buy.

// The nine, in the order they are shown. A product decision rather than an
// admin one, so it is stated here and not read from `sortOrder` — the running
// order the nav and the PLP rail share answers "where does this shelf sit in
// the catalogue", which is a different question from "what does the homepage
// lead with". Keyed on slug, a category's stable identity; never on its name.
// A slug that no longer exists (or isn't ACTIVE) simply drops out.
const HOME_CATEGORY_SLUGS = [
  "engine-oil",
  "gearbox-oil",
  "oil-filter",
  "air-filter",
  "fuel-filter",
  "cabin-filter",
  "hydraulic-oil",
  "coolant",
  "accessory",
] as const;

const HOME_RANK = new Map<string, number>(HOME_CATEGORY_SLUGS.map((slug, index) => [slug, index]));

/** The section's two zones: the nine, and what "Show more" opens. */
function partitionHomeCategories(categories: StorefrontCategory[]) {
  return {
    // Sorted by this list rather than by `sortOrder`, so the nine read in the
    // order above whatever the admin's running order happens to be.
    featured: categories
      .filter((category) => HOME_RANK.has(category.slug))
      .sort((a, b) => HOME_RANK.get(a.slug)! - HOME_RANK.get(b.slug)!),
    // Everything else keeps the admin's order, which is how the service
    // already handed it over.
    rest: categories.filter((category) => !HOME_RANK.has(category.slug)),
  };
}

const CARD_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

const CARD_IMAGE_SIZES = "(min-width: 1024px) 360px, (min-width: 640px) 46vw, 92vw";

// ProductCard's hatched "no artwork yet" slot, redrawn dark: the card's ground
// is now the image itself, and the name sits on top of it in white — so the
// placeholder has to be dark enough to keep that name readable too.
const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-700) 0 1px, transparent 1px 10px)",
};

export function CategoryBrowseSection({
  locale,
  categories,
}: {
  locale: Locale;
  categories: StorefrontCategory[];
}) {
  const browseHref = navHref(locale, PRODUCTS_PATH);
  const { featured, rest } = partitionHomeCategories(categories);

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 lg:py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
            {pickLocale(locale, "Shop by category", "خرید بر اساس دسته‌بندی")}
          </h2>
          <p className="mt-1 text-[13.5px] text-fg-subtle">
            {pickLocale(
              locale,
              "Know what you need? Skip the car finder and browse the catalogue.",
              "می‌دانید دنبال چه هستید؟ بدون جست‌وجوی خودرو، مستقیم در فهرست محصولات بگردید.",
            )}
          </p>
        </div>

        <Link
          href={browseHref}
          className="focus-visible:ring-accent hover:text-accent inline-flex min-h-11 items-center gap-1.5 rounded text-[13.5px] text-fg-subtle transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {pickLocale(locale, "See all products", "مشاهده‌ی همه‌ی محصولات")}
          <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </Link>
      </div>

      {categories.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface px-5 py-6 text-[14px] text-fg-muted">
          {pickLocale(
            locale,
            "Categories are still being set up — the full product list is already there.",
            "دسته‌بندی‌ها هنوز در حال آماده‌سازی است — فهرست کامل محصولات از هم‌اکنون در دسترس است.",
          )}
        </p>
      ) : (
        <>
          <ul className={`mt-6 ${CARD_GRID}`}>
            {featured.map((category) => (
              <li key={category.id}>
                <CategoryCard locale={locale} category={category} />
              </li>
            ))}
          </ul>

          {rest.length > 0 && <MoreCategories locale={locale} categories={rest} />}
        </>
      )}
    </section>
  );
}

// A native <details> rather than a client-side toggle, the same as the results
// page's secondary zone: no "use client" for one button, open to a keyboard and
// a screen reader without help, and a browser's in-page find can open it.
function MoreCategories({
  locale,
  categories,
}: {
  locale: Locale;
  categories: StorefrontCategory[];
}) {
  return (
    <details data-testid="home-more-categories" className="group mt-6">
      <summary className="focus-visible:ring-accent mx-auto flex w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-[13.5px] font-medium text-fg-muted transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {/* Both labels are rendered and one is hidden by the open state, so the
            button says "Show less" once it has been opened rather than lying. */}
        <span className="group-open:hidden">{pickLocale(locale, "Show more", "نمایش بیشتر")}</span>
        <span className="hidden group-open:inline">
          {pickLocale(locale, "Show less", "نمایش کمتر")}
        </span>
        {/* The space is literal, not just the margin: a screen reader reads the
            text nodes, and "Show more12" is what it would otherwise say. */}{" "}
        <span className="text-fg-faint group-open:hidden">
          {formatDigits(categories.length, locale)}
        </span>
        <ChevronIcon
          aria-hidden
          className="h-3.5 w-3.5 rotate-90 text-fg-faint transition-transform group-open:-rotate-90"
        />
      </summary>

      <ul className={`mt-6 ${CARD_GRID}`}>
        {categories.map((category) => (
          <li key={category.id}>
            <CategoryCard locale={locale} category={category} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function CategoryCard({ locale, category }: { locale: Locale; category: StorefrontCategory }) {
  const primaryName = pickLocale(locale, category.nameEn, category.nameFa);
  // The other language's name, same as ProductCard: shoppers here recognise
  // "Oil Filter" and "فیلتر روغن" interchangeably.
  const secondaryName = locale === "fa" ? category.nameEn : category.nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== primaryName;

  return (
    <Link
      href={categoryHref(locale, category.slug)}
      className="group focus-visible:ring-accent hover:ring-accent relative block aspect-[16/10] overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-black/5 transition-shadow ring-inset hover:ring-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {category.image ? (
        <Image
          src={category.image}
          alt=""
          fill
          sizes={CARD_IMAGE_SIZES}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <span style={PLACEHOLDER_STYLE} className="block h-full w-full bg-neutral-800" />
      )}

      {/* The name sits on artwork nobody has vetted for contrast — and a fair
          few of these are product shots on a white ground — so it gets its own:
          90% at the very bottom, which still clears AA for white text over a
          pure-white image, faded out by mid-card so it never reads as a grey
          box over a dark one. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold tracking-[-0.015em] text-white">
            {primaryName}
          </div>
          {showSecondaryName && (
            <p dir="auto" className="mt-0.5 truncate text-[12.5px] text-white/80">
              {secondaryName}
            </p>
          )}
        </div>
        <ChevronIcon className="h-4 w-4 shrink-0 text-white/80 rtl:-scale-x-100" />
      </div>
    </Link>
  );
}
