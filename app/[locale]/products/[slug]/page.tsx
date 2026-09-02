import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { JsonLd } from "@/components/storefront/JsonLd";
import { categoryHref, navHref, PRODUCTS_PATH } from "@/components/storefront/nav-items";
import { AddToCartControl } from "@/components/storefront/pdp/AddToCartControl";
import { CompatibleVehicles } from "@/components/storefront/pdp/CompatibleVehicles";
import { FitsYourCarNotice } from "@/components/storefront/pdp/FitsYourCarNotice";
import { SizeSelector } from "@/components/storefront/pdp/SizeSelector";
import { PriceDisplay } from "@/components/storefront/PriceDisplay";
import { StockBadge } from "@/components/storefront/StockBadge";
import { pickLocale, type Locale } from "@/lib/i18n";
import { getStorefrontProductBySlug } from "@/lib/services/catalog";
import { getActiveCarEngineContext } from "@/lib/services/fitment";
import { FIT_PARAM, withFitContext } from "@/lib/storefront/fitment";
import { buildProductListHref } from "@/lib/storefront/plp";
import {
  buildSizeOptions,
  formatProductSpecs,
  groupFittingEnginesByModel,
} from "@/lib/storefront/pdp";
import { firstFilled, localeAlternates } from "@/lib/storefront/seo";
import { absoluteUrl } from "@/lib/storefront/sitemap";
import { productSchema } from "@/lib/storefront/structured-data";
import { storefrontProductSlugParamSchema } from "@/lib/validation";

// One product, and the two things the catalog knows about it that a generic
// shop doesn't: which cars it was matched to, and — when the customer arrived
// from the car finder — whether theirs is one of them.
//
// The URL stays car-agnostic (Design Decision 5): `?fit=` is context riding
// alongside the slug, never part of it, so the page a search engine indexes and
// the page a customer shares are the same page.
//
// Data comes from lib/services/catalog directly rather than by fetching this
// app's own GET /api/storefront/products/:slug — same function that route
// serves, minus an HTTP round-trip to ourselves, and it renders on the server
// instead of arriving after a spinner. Same pattern as the PLP and the fitment
// page; the public route still exists for client callers.

// The locale-relative path this page lives at, in the one form both the
// canonical URL and the hreflang pair are built from.
const productPagePath = (slug: string) => `${PRODUCTS_PATH}/${slug}`;

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const product = await findProduct(slug);
  // Unknown, deactivated, or hanging off a deactivated category/brand: all the
  // same 404, exactly as the public route answers them.
  if (!product) notFound();

  const rawFit = (await searchParams)[FIT_PARAM];
  // A `fit` that resolves to nothing is a stale or hand-edited link, not a 404 —
  // the product page renders either way, just without the verdict.
  const car = typeof rawFit === "string" ? await getActiveCarEngineContext(rawFit) : null;
  const fitsThisCar =
    car !== null &&
    product.fitsCarEngines.some((engine) => engine.carEngineId === car.carEngine.id);

  const vehicleGroups = groupFittingEnginesByModel(product.fitsCarEngines);
  const specRows = formatProductSpecs(locale, product);

  const name = pickLocale(locale, product.nameEn, product.nameFa);
  // The other language's name, same as ProductCard: shoppers here search for
  // "Mobil 1" and "موبیل ۱" interchangeably.
  const secondaryName = locale === "fa" ? product.nameEn : product.nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== name;

  const categoryName = pickLocale(locale, product.category.nameEn, product.category.nameFa);
  const brandName = pickLocale(locale, product.brand.nameEn, product.brand.nameFa);
  const longDescription = pickLocale(locale, product.longDescriptionEn, product.longDescriptionFa);
  const shortDescription = pickLocale(
    locale,
    product.shortDescriptionEn,
    product.shortDescriptionFa,
  );

  // Every link out of this page keeps the customer's car with them, the same
  // way the PLP hands it over on the way in.
  const carryFit = (href: string) => (car ? withFitContext(href, car.carEngine.id) : href);

  // The other bottle sizes of this same oil, this one included so the row reads
  // as a choice. Empty whenever the product has no siblings, and the selector
  // renders nothing.
  const sizeOptions = buildSizeOptions(locale, product, product.sizeSiblings).map((option) => ({
    label: option.label,
    isCurrent: option.isCurrent,
    href: option.isCurrent ? undefined : carryFit(navHref(locale, productPagePath(option.slug))),
  }));

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      {/* Everything below stated once more for a crawler: the price the
          customer is asked to pay, and whether they can have it today. The URL
          is the canonical one — `?fit=` never enters it, so the same product
          reached with and without a car is one offer, not two. */}
      <JsonLd
        data={productSchema({
          name,
          url: absoluteUrl(navHref(locale, productPagePath(product.slug))),
          sku: product.sku,
          brandName,
          finalPrice: product.finalPrice,
          stockStatus: product.stockStatus,
          description: firstFilled(shortDescription, longDescription),
          image: product.image,
        })}
      />

      <Breadcrumbs
        locale={locale}
        structuredData
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          {
            label: pickLocale(locale, "Products", "محصولات"),
            href: carryFit(navHref(locale, PRODUCTS_PATH)),
          },
          { label: categoryName, href: carryFit(categoryHref(locale, product.category.slug)) },
          { label: name },
        ]}
      />

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-muted lg:aspect-square">
          {product.image ? (
            <Image
              src={product.image}
              alt={name}
              fill
              sizes="(min-width: 1024px) 720px, 100vw"
              className="object-contain p-6"
              priority
            />
          ) : (
            // Same designed placeholder as ProductCard — a catalog mid-import
            // is the norm, so a missing image is a state, not a broken icon.
            <span
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, var(--color-neutral-200) 0 1px, transparent 1px 12px)",
              }}
              className="flex h-full w-full items-center justify-center font-mono text-[11px] tracking-[0.04em] text-fg-subtle"
            >
              {pickLocale(locale, "no image", "بدون تصویر")}
            </span>
          )}
        </div>

        <div className="lg:pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildProductListHref(navHref(locale, PRODUCTS_PATH), {
                brand: product.brand.slug,
                fit: car?.carEngine.id,
              })}
              className="focus-visible:ring-accent hover:border-accent hover:text-accent rounded-full border border-line px-3 py-1 font-mono text-[11.5px] tracking-[0.04em] text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {brandName}
            </Link>
            <Link
              href={carryFit(categoryHref(locale, product.category.slug))}
              className="focus-visible:ring-accent hover:border-accent hover:text-accent rounded-full border border-line px-3 py-1 text-[12px] text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {categoryName}
            </Link>
          </div>

          <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-[-0.025em] text-fg">
            {name}
          </h1>
          {showSecondaryName && (
            <p dir="auto" className="mt-1 text-[14.5px] text-fg-subtle">
              {secondaryName}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <PriceDisplay
              locale={locale}
              price={product.price}
              finalPrice={product.finalPrice}
              size="lg"
            />
            <StockBadge locale={locale} status={product.stockStatus} variant="pill" />
          </div>

          {car && (
            <FitsYourCarNotice locale={locale} car={car} fits={fitsThisCar} className="mt-5" />
          )}

          <SizeSelector locale={locale} options={sizeOptions} className="mt-6" />

          <AddToCartControl
            locale={locale}
            outOfStock={product.stockStatus === "OUT_OF_STOCK"}
            product={{
              productId: product.id,
              slug: product.slug,
              nameEn: product.nameEn,
              nameFa: product.nameFa,
              image: product.image,
              // What the customer was shown. Checkout re-resolves the real
              // price server-side, so nothing captured here is ever charged.
              price: product.finalPrice,
            }}
            className="mt-6"
          />
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <div>
          {longDescription.trim() !== "" && (
            <section>
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
                {pickLocale(locale, "Description", "توضیحات")}
              </h2>
              {/* Plain text, not markup: descriptions are edited in a textarea
                  and stripped of HTML on the way in (lib/sanitize), so the only
                  formatting to honour is the line breaks the admin typed. */}
              <p className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed whitespace-pre-line text-fg-muted">
                {longDescription}
              </p>
            </section>
          )}

          {vehicleGroups.length > 0 && (
            <CompatibleVehicles
              locale={locale}
              groups={vehicleGroups}
              highlightCarEngineId={fitsThisCar ? car?.carEngine.id : null}
              className="mt-10"
            />
          )}
        </div>

        {/* The side column holds the two reference lists. It's rendered only
            when at least one has something in it, so a bare catalog row doesn't
            leave an empty track next to the description. */}
        {(specRows.length > 0 || product.oemPartNumbers.length > 0) && (
          <div className="flex flex-col gap-10">
            {specRows.length > 0 && (
              <section>
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
                  {pickLocale(locale, "Specifications", "مشخصات")}
                </h2>
                <dl className="mt-3 border-t border-line">
                  {specRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-4 border-b border-line py-2.5"
                    >
                      <dt className="text-[13.5px] text-fg-subtle">{row.label}</dt>
                      {/* `auto` because the value is a Latin code in either
                          locale ("5W-30") but a translated unit in Persian
                          ("۴ لیتر"). */}
                      <dd dir="auto" className="text-[14px] font-medium text-fg">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {product.oemPartNumbers.length > 0 && (
              <section>
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
                  {pickLocale(locale, "OEM part numbers", "شماره‌های فنی اصلی")}
                </h2>
                <p className="mt-2 text-[13.5px] text-fg-subtle">
                  {pickLocale(
                    locale,
                    "Manufacturer codes this part replaces — search any of them to land back here.",
                    "کدهای کارخانه‌ای که این قطعه جایگزین آن‌هاست — جست‌وجوی هرکدام دوباره به همین صفحه می‌رسد.",
                  )}
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {product.oemPartNumbers.map((partNumber) => (
                    <li
                      key={partNumber}
                      dir="ltr"
                      className="rounded-lg border border-line bg-surface-sunken px-2.5 py-1 font-mono text-[12.5px] tracking-[0.02em] text-fg-muted"
                    >
                      {partNumber}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// generateMetadata and the page both need the row, and Prisma has no
// per-request dedupe of its own — `cache` keeps it to one query.
const findProduct = cache(async (slug: string) => {
  const parsed = storefrontProductSlugParamSchema.safeParse(slug);
  // A segment that can't be a slug can't match a row either; skip the query.
  if (!parsed.success) return null;
  return getStorefrontProductBySlug(parsed.data);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await findProduct(slug);
  // The page 404s; there's nothing to describe.
  if (!product) return {};

  return {
    // Same slug in both trees (Design Decision 2), so the pair needs nothing
    // but the path this page already lives at.
    alternates: localeAlternates(locale, productPagePath(product.slug)),
    title: firstFilled(
      pickLocale(locale, product.metaTitleEn, product.metaTitleFa),
      pickLocale(locale, product.nameEn, product.nameFa),
    ),
    description: firstFilled(
      pickLocale(locale, product.metaDescriptionEn, product.metaDescriptionFa),
      pickLocale(locale, product.shortDescriptionEn, product.shortDescriptionFa),
    ),
  };
}
