import Image from "next/image";
import Link from "next/link";
import { ChevronIcon } from "../icons";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontCategory } from "@/lib/services/catalog";

// The escape hatch from the car-finder: a customer who already knows they want
// air filters shouldn't have to answer four questions about their car first.
// Every card is a pre-filtered PLP link, not a category page of its own — the
// catalog is one filterable list (see PRODUCTS_PATH).

const CARD_IMAGE_SIZES = "(min-width: 1024px) 360px, (min-width: 640px) 46vw, 92vw";

// Same hatched slot as ProductCard's missing image: a category with no artwork
// yet is a designed state, not a hole in the grid.
const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-200) 0 1px, transparent 1px 10px)",
};

export function CategoryBrowseSection({
  locale,
  categories,
}: {
  locale: Locale;
  categories: StorefrontCategory[];
}) {
  const browseHref = navHref(locale, PRODUCTS_PATH);

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 lg:py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-neutral-900">
            {pickLocale(locale, "Shop by category", "خرید بر اساس دسته‌بندی")}
          </h2>
          <p className="mt-1 text-[13.5px] text-neutral-500">
            {pickLocale(
              locale,
              "Know what you need? Skip the car finder and browse the catalogue.",
              "می‌دانید دنبال چه هستید؟ بدون جست‌وجوی خودرو، مستقیم در فهرست محصولات بگردید.",
            )}
          </p>
        </div>

        <Link
          href={browseHref}
          className="focus-visible:ring-accent hover:text-accent inline-flex min-h-11 items-center gap-1.5 rounded text-[13.5px] text-neutral-500 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {pickLocale(locale, "See all products", "مشاهده‌ی همه‌ی محصولات")}
          <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </Link>
      </div>

      {categories.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-neutral-200 bg-white px-5 py-6 text-[14px] text-neutral-600">
          {pickLocale(
            locale,
            "Categories are still being set up — the full product list is already there.",
            "دسته‌بندی‌ها هنوز در حال آماده‌سازی است — فهرست کامل محصولات از هم‌اکنون در دسترس است.",
          )}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.id}>
              <CategoryCard locale={locale} category={category} browseHref={browseHref} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoryCard({
  locale,
  category,
  browseHref,
}: {
  locale: Locale;
  category: StorefrontCategory;
  browseHref: string;
}) {
  const primaryName = pickLocale(locale, category.nameEn, category.nameFa);
  // The other language's name, same as ProductCard: shoppers here recognise
  // "Oil Filter" and "فیلتر روغن" interchangeably.
  const secondaryName = locale === "fa" ? category.nameEn : category.nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== primaryName;

  return (
    <Link
      href={`${browseHref}?category=${category.slug}`}
      className="focus-visible:ring-accent hover:border-accent/50 block h-full rounded-2xl border border-neutral-200 bg-white p-3.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="relative h-[132px] overflow-hidden rounded-xl bg-neutral-100">
        {category.image ? (
          <Image
            src={category.image}
            alt=""
            fill
            sizes={CARD_IMAGE_SIZES}
            className="object-cover"
          />
        ) : (
          <span style={PLACEHOLDER_STYLE} className="block h-full w-full" />
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15.5px] font-semibold tracking-[-0.015em] text-neutral-900">
            {primaryName}
          </div>
          {showSecondaryName && (
            <p dir="auto" className="mt-0.5 truncate text-[12.5px] text-neutral-500">
              {secondaryName}
            </p>
          )}
        </div>
        <ChevronIcon className="h-4 w-4 shrink-0 text-neutral-400 rtl:-scale-x-100" />
      </div>
    </Link>
  );
}
