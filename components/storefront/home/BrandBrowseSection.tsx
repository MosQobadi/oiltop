import Image from "next/image";
import Link from "next/link";
import { ChevronIcon } from "../icons";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontBrand } from "@/lib/services/catalog";
import { buildProductListHref } from "@/lib/storefront/plp";

// The other way into the catalog, next to "shop by category": a customer who
// buys the same brand every time shouldn't have to find it in a sidebar filter.
// Each tile links to the PLP pre-filtered to that brand — the same `?brand=<slug>`
// URL the sidebar writes, built through `buildProductListHref` so the homepage
// can't invent a second spelling of a filtered listing.
//
// A brand with no logo uploaded yet gets a monogram tile rather than an empty
// box: brands are a wall of small cells, and one hole in it reads as broken.

const LOGO_SIZES = "(min-width: 1024px) 160px, (min-width: 640px) 22vw, 40vw";

export function BrandBrowseSection({
  locale,
  brands,
}: {
  locale: Locale;
  brands: StorefrontBrand[];
}) {
  // No brands set up yet is not a state worth designing for on the homepage —
  // an empty brand wall says less than no brand wall.
  if (brands.length === 0) return null;

  const basePath = navHref(locale, PRODUCTS_PATH);

  return (
    <section className="border-y border-neutral-200 bg-neutral-50">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 lg:py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-neutral-900">
              {pickLocale(locale, "Shop by brand", "خرید بر اساس برند")}
            </h2>
            <p className="mt-1 text-[13.5px] text-neutral-500">
              {pickLocale(
                locale,
                "The names we stock. Pick one to see everything we carry from it.",
                "برندهایی که موجود داریم. یکی را انتخاب کنید تا همه‌ی محصولات آن را ببینید.",
              )}
            </p>
          </div>

          <Link
            href={basePath}
            className="focus-visible:ring-accent hover:text-accent inline-flex min-h-11 items-center gap-1.5 rounded text-[13.5px] text-neutral-500 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "See all products", "مشاهده‌ی همه‌ی محصولات")}
            <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </Link>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((brand) => (
            <li key={brand.id}>
              <BrandCard
                locale={locale}
                brand={brand}
                href={buildProductListHref(basePath, { brand: brand.slug })}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BrandCard({
  locale,
  brand,
  href,
}: {
  locale: Locale;
  brand: StorefrontBrand;
  href: string;
}) {
  const primaryName = pickLocale(locale, brand.nameEn, brand.nameFa);
  // The other language's name, same as ProductCard and the category cards:
  // shoppers here recognise "Mobil" and "موبیل" interchangeably.
  const secondaryName = locale === "fa" ? brand.nameEn : brand.nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== primaryName;

  return (
    <Link
      href={href}
      className="focus-visible:ring-accent hover:border-accent/50 flex h-full flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-5 text-center transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span className="relative flex h-14 w-full items-center justify-center">
        {brand.logo ? (
          <Image
            src={brand.logo}
            alt=""
            fill
            sizes={LOGO_SIZES}
            // Contained, not cropped: a logo is the one image on this page whose
            // whole shape is the point.
            className="object-contain"
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-accent bg-accent/10 flex size-14 items-center justify-center rounded-full text-[17px] font-semibold tracking-[-0.02em]"
          >
            {brandMonogram(brand.nameEn || brand.nameFa)}
          </span>
        )}
      </span>

      <span className="w-full min-w-0">
        <span className="block truncate text-[14.5px] font-semibold tracking-[-0.015em] text-neutral-900">
          {primaryName}
        </span>
        {showSecondaryName && (
          <span dir="auto" className="mt-0.5 block truncate text-[12.5px] text-neutral-500">
            {secondaryName}
          </span>
        )}
      </span>
    </Link>
  );
}

// Up to two initials — "Mobil 1" → "M1", "Shell" → "S". Uppercasing is a no-op
// for a Farsi fallback name, which has no case to raise.
function brandMonogram(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
  return initials.toUpperCase();
}
