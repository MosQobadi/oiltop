import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { FitContextBanner } from "@/components/storefront/FitContextBanner";
import { navHref, PRODUCTS_PATH } from "@/components/storefront/nav-items";
import { Pagination } from "@/components/storefront/Pagination";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductFilters } from "@/components/storefront/ProductFilters";
import { ProductSortSelect } from "@/components/storefront/ProductSortSelect";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  listActiveCategories,
  listActiveProductBrands,
  listStorefrontProducts,
} from "@/lib/services/catalog";
import { getActiveCarEngineContext } from "@/lib/services/fitment";
import { FIT_PARAM, withFitContext } from "@/lib/storefront/fitment";
import {
  activeProductFilterCount,
  buildProductListHref,
  clearProductFilters,
  collapseSearchParams,
  PLP_PAGE_SIZE,
  productCountLabel,
  productPageCount,
  type ProductListParams,
} from "@/lib/storefront/plp";
import { localeAlternates } from "@/lib/storefront/seo";
import { storefrontProductListPageQuerySchema } from "@/lib/validation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    // One listing, however it's filtered: the canonical drops the query string
    // so a facet combination doesn't compete with the page it narrows, and the
    // products themselves stay individually indexed through the sitemap and
    // their category landing pages.
    alternates: localeAlternates(locale, PRODUCTS_PATH),
  };
}

// General browsing: the whole catalog, narrowed by whatever the query string
// says. The filters are in the URL rather than a store, so a filtered view is
// linkable and crawlable and the grid renders on the server — only the controls
// that write the next URL ship to the browser.
//
// `?fit=` is carried, never applied. A customer arriving from the car finder
// keeps their car in a banner (and in every link they follow, so the PDP can
// say "fits your car"), but the grid stays the full catalog: narrowing to one
// car is what the fitment results page is for, and silently hiding products
// here would look like an empty shop.
//
// Data comes from lib/services/catalog directly rather than by fetching this
// app's own GET /api/storefront/products — the same function that route serves,
// minus an HTTP round-trip to ourselves. Same pattern as the fitment page and
// the layout's Settings read; the public route still exists for client callers.

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const raw = collapseSearchParams(await searchParams);
  const query = storefrontProductListPageQuerySchema.parse(raw);
  const fit = raw[FIT_PARAM];

  const [{ products, total }, categories, brands, car] = await Promise.all([
    listStorefrontProducts({ ...query, pageSize: PLP_PAGE_SIZE }),
    listActiveCategories(),
    listActiveProductBrands(),
    // A `fit` that resolves to nothing is a stale or hand-edited link, not a
    // 404 — the catalog renders either way, just without the banner.
    fit ? getActiveCarEngineContext(fit) : null,
  ]);

  const basePath = navHref(locale, PRODUCTS_PATH);
  const currentParams: ProductListParams = { ...query, fit: car?.carEngine.id };
  const pageCount = productPageCount(total, PLP_PAGE_SIZE);
  const filtersApplied = activeProductFilterCount(currentParams) > 0;

  const productsLabel = pickLocale(locale, "Products", "محصولات");

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        structuredData
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: productsLabel },
        ]}
      />

      <h1 className="mt-5 text-[27px] font-semibold tracking-[-0.025em] text-fg">
        {productsLabel}
      </h1>
      <p className="mt-2 max-w-[60ch] text-[14.5px] text-fg-subtle">
        {pickLocale(
          locale,
          "Every oil and filter we carry. Filter by what you're after, or let the car finder match your car.",
          "همه‌ی روغن‌ها و فیلترهایی که داریم. بر اساس آنچه می‌خواهید فیلتر کنید، یا بگذارید جست‌وجوی خودرو، خودروی شما را پیدا کند.",
        )}
      </p>

      {car && (
        <FitContextBanner
          locale={locale}
          car={car}
          dismissHref={buildProductListHref(basePath, { ...currentParams, fit: undefined })}
          className="mt-5"
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-8">
        <ProductFilters
          locale={locale}
          basePath={basePath}
          params={currentParams}
          categories={categories.map((category) => ({
            value: category.slug,
            label: pickLocale(locale, category.nameEn, category.nameFa),
          }))}
          brands={brands.map((brand) => ({
            value: brand.slug,
            label: pickLocale(locale, brand.nameEn, brand.nameFa),
          }))}
          className="lg:sticky lg:top-24 lg:self-start"
        />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p aria-live="polite" className="text-[13px] text-fg-subtle">
              {productCountLabel(locale, total)}
            </p>
            <ProductSortSelect locale={locale} basePath={basePath} params={currentParams} />
          </div>

          {products.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-line bg-surface px-5 py-10 text-center">
              <p className="text-[15px] font-medium text-fg">
                {filtersApplied
                  ? pickLocale(
                      locale,
                      "Nothing matches these filters.",
                      "چیزی با این فیلترها پیدا نشد.",
                    )
                  : pickLocale(locale, "No products are listed yet.", "هنوز محصولی ثبت نشده است.")}
              </p>
              {filtersApplied && (
                <Link
                  href={buildProductListHref(basePath, clearProductFilters(currentParams))}
                  className="focus-visible:ring-accent text-accent mt-3 inline-flex min-h-11 items-center rounded text-[13.5px] font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {pickLocale(locale, "Clear all filters", "پاک کردن همه‌ی فیلترها")}
                </Link>
              )}
            </div>
          ) : (
            <ul
              data-testid="product-grid"
              className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4"
            >
              {products.map((product) => (
                <li key={product.id}>
                  <ProductCard
                    locale={locale}
                    product={product}
                    // The car rides along to the PDP, which is where "fits your
                    // car" gets said (Task 5.1).
                    href={
                      car
                        ? withFitContext(
                            navHref(locale, `/products/${product.slug}`),
                            car.carEngine.id,
                          )
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          <Pagination
            locale={locale}
            page={query.page}
            pageCount={pageCount}
            hrefForPage={(page) => buildProductListHref(basePath, { ...currentParams, page })}
            className="mt-8"
          />
        </div>
      </div>
    </div>
  );
}
