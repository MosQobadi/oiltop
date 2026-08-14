import Image from "next/image";
import Link from "next/link";
import { ChevronIcon } from "../icons";
import { categoryHref, navHref, PRODUCTS_PATH } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontCategory } from "@/lib/services/catalog";

// The escape hatch from the car-finder: a customer who already knows they want
// air filters shouldn't have to answer four questions about their car first.
// Each card goes to that category's landing page rather than a pre-filtered PLP
// URL — same grid either way, but the landing page is the one with the copy and
// the SEO pair, and linking it from the homepage is what keeps it crawlable.

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
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.id}>
              <CategoryCard locale={locale} category={category} />
            </li>
          ))}
        </ul>
      )}
    </section>
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
