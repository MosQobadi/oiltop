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
//
// The tiles are built to read as siblings of the category cards directly above
// them — same radius, same ring, same accent ring on hover, and the same
// name-and-chevron row at the bottom. What they can't share is the treatment
// itself: a category card is a photograph with the name laid over it, and a
// logo laid over is a logo cropped. So the card splits instead — a white stage
// the logo sits in whole, and a name plate under it — and the shared grammar
// carries the family resemblance rather than the shared ground.

const LOGO_SIZES = "(min-width: 1024px) 160px, (min-width: 640px) 22vw, 40vw";

// The one thing the tile has that the category card doesn't: a breath of the
// brand accent behind the logo, off until the card is hovered. A logo on white
// gives hover nothing to change — the ring alone is easy to miss on a wall of
// eight — so the stage itself warms up. Mixed from `--accent` rather than
// written as a hex, so it stays the theme's rust if the theme ever moves.
const STAGE_GLOW_STYLE = {
  backgroundImage:
    "radial-gradient(circle at 50% 42%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%)",
};

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
    <section className="border-y border-line bg-surface-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 lg:py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
              {pickLocale(locale, "Shop by brand", "خرید بر اساس برند")}
            </h2>
            <p className="mt-1 text-[13.5px] text-fg-subtle">
              {pickLocale(
                locale,
                "The names we stock. Pick one to see everything we carry from it.",
                "برندهایی که موجود داریم. یکی را انتخاب کنید تا همه‌ی محصولات آن را ببینید.",
              )}
            </p>
          </div>

          <Link
            href={basePath}
            className="focus-visible:ring-accent hover:text-accent inline-flex min-h-11 items-center gap-1.5 rounded text-[13.5px] text-fg-subtle transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "See all products", "مشاهده‌ی همه‌ی محصولات")}
            <ChevronIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </Link>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((brand) => (
            // Stretched, so a brand whose second name wraps doesn't leave a
            // shorter tile floating next to it.
            <li key={brand.id} className="h-full">
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
      className="group focus-visible:ring-accent hover:ring-accent flex h-full flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line transition-shadow ring-inset hover:ring-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {/* The stage. Its own aspect ratio rather than the whole card's, so the
          logo keeps its room whether the plate below runs to one line or two.
          Taller on a phone, where two names on the plate cost the same 68px on a
          164px tile as on a 271px one — a 5:3 stage there leaves the logo less
          room than the caption under it. */}
      <span className="relative flex aspect-[4/3] w-full items-center justify-center sm:aspect-[5/3]">
        <span
          aria-hidden="true"
          style={STAGE_GLOW_STYLE}
          className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
        />

        {brand.logo ? (
          <Image
            src={brand.logo}
            alt=""
            fill
            sizes={LOGO_SIZES}
            // Contained, not cropped — the one rule the category cards next door
            // don't share. A photo of an air filter survives losing its edges;
            // a logo *is* its edges, so it gets the whole stage to sit in rather
            // than being blown up to fill it.
            className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:p-5"
          />
        ) : (
          <span
            aria-hidden="true"
            // A tile, not a disc: it stands in for a logo, so it should read as
            // one sitting on the stage rather than as an avatar.
            className="text-accent ring-accent/15 relative flex size-14 items-center justify-center rounded-2xl bg-surface text-[18px] font-semibold tracking-[-0.02em] ring-1 ring-inset"
          >
            {brandMonogram(brand.nameEn || brand.nameFa)}
          </span>
        )}
      </span>

      {/* The category card's bottom row, moved off the artwork and onto its own
          plate — name on the lead edge, chevron on the trailing one. The hairline
          is what makes it a plate instead of the scrim it used to be, and the
          scrim is what the logo above kept fading into. The plate stays white
          with the rest of the card rather than taking a grey: the section's own
          ground is that grey, and a grey plate on it ends the card at the
          hairline instead of at its edge. */}
      <span className="mt-auto flex items-end justify-between gap-2 border-t border-line px-3.5 py-3">
        <span className="block min-w-0">
          <span className="block truncate text-[14.5px] font-semibold tracking-[-0.015em] text-fg">
            {primaryName}
          </span>
          {showSecondaryName && (
            <span dir="auto" className="mt-0.5 block truncate text-[12.5px] text-fg-subtle">
              {secondaryName}
            </span>
          )}
        </span>
        <ChevronIcon
          aria-hidden
          className="group-hover:text-accent h-4 w-4 shrink-0 text-fg-faint transition-colors rtl:-scale-x-100"
        />
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
