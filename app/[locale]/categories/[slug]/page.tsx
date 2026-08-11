import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { FitContextBanner } from "@/components/storefront/FitContextBanner";
import {
  CATEGORIES_PATH,
  categoryHref,
  navHref,
  PRODUCTS_PATH,
} from "@/components/storefront/nav-items";
import { Pagination } from "@/components/storefront/Pagination";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductFilters } from "@/components/storefront/ProductFilters";
import { ProductSortSelect } from "@/components/storefront/ProductSortSelect";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  getStorefrontCategoryBySlug,
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
import { firstFilled, localeAlternates } from "@/lib/storefront/seo";
import {
  storefrontCategorySlugParamSchema,
  storefrontProductListPageQuerySchema,
} from "@/lib/validation";

// The crawlable half of the catalog. `/products?category=oil-filters` is the
// same set of products, but a query string is a filter a customer applied,
// while this is a page a search engine can rank: it has its own copy, its own
// SEO pair, and a URL that says what it is. So the grid below is Task 4.1's,
// pre-scoped — the category comes from the path and never from the query
// string, which keeps one category to exactly one URL here.
//
// Everything the two pages share (the sort control, pagination, the fit banner,
// the href builder) is shared code rather than a second implementation; what
// differs is the hero above it and the two filter controls this page pins.

export default async function CategoryLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const category = await findCategory(slug);
  // Unknown or deactivated is a 404, not an empty grid — an unlisted category
  // shouldn't keep answering 200.
  if (!category) notFound();

  const raw = collapseSearchParams(await searchParams);
  const query = storefrontProductListPageQuerySchema.parse(raw);
  const fit = raw[FIT_PARAM];

  const [{ products, total }, brands, car] = await Promise.all([
    // Spelled out rather than spread: `category` is this page's own, so a
    // hand-edited `?category=` mustn't narrow a grid whose rail has no control
    // to undo it.
    listStorefrontProducts({
      category: category.slug,
      brand: query.brand,
      search: query.search,
      sort: query.sort,
      page: query.page,
      pageSize: PLP_PAGE_SIZE,
    }),
    listActiveProductBrands(),
    // A `fit` that resolves to nothing is a stale or hand-edited link, not a
    // 404 — the category renders either way, just without the banner.
    fit ? getActiveCarEngineContext(fit) : null,
  ]);

  const basePath = categoryHref(locale, category.slug);
  // `category` is deliberately absent: it's the path, so writing it into the
  // query string too would give this page a second spelling of itself.
  const currentParams: ProductListParams = {
    brand: query.brand,
    search: query.search,
    sort: query.sort,
    page: query.page,
    fit: car?.carEngine.id,
  };
  const pageCount = productPageCount(total, PLP_PAGE_SIZE);
  const filtersApplied = activeProductFilterCount(currentParams) > 0;

  const name = pickLocale(locale, category.nameEn, category.nameFa);
  // The other language's name, same as ProductCard and the homepage cards:
  // shoppers here recognise "Oil Filter" and "فیلتر روغن" interchangeably.
  const secondaryName = locale === "fa" ? category.nameEn : category.nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== name;
  const shortDescription = pickLocale(
    locale,
    category.shortDescriptionEn,
    category.shortDescriptionFa,
  );

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        structuredData
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          {
            label: pickLocale(locale, "Products", "محصولات"),
            href: navHref(locale, PRODUCTS_PATH),
          },
          { label: name },
        ]}
      />

      <div
        className={`mt-5 grid items-center gap-6 ${
          category.image ? "sm:grid-cols-[minmax(0,1fr)_260px]" : ""
        }`}
      >
        <div>
          <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">{name}</h1>
          {showSecondaryName && (
            <p dir="auto" className="mt-1 text-[14px] text-neutral-500">
              {secondaryName}
            </p>
          )}
          {shortDescription.trim() !== "" && (
            <p className="mt-3 max-w-[60ch] text-[14.5px] text-pretty text-neutral-500">
              {shortDescription}
            </p>
          )}
        </div>

        {category.image && (
          <div className="relative h-[150px] overflow-hidden rounded-2xl bg-neutral-100">
            {/* Decorative: the heading beside it already names the category. */}
            <Image
              src={category.image}
              alt=""
              fill
              sizes="(min-width: 640px) 260px, 100vw"
              className="object-cover"
              priority
            />
          </div>
        )}
      </div>

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
          brands={brands.map((brand) => ({
            value: brand.slug,
            label: pickLocale(locale, brand.nameEn, brand.nameFa),
          }))}
          // The category is the page itself here — see PinnedProductFilter.
          pinned={["category"]}
          className="lg:sticky lg:top-6 lg:self-start"
        />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p aria-live="polite" className="text-[13px] text-neutral-500">
              {productCountLabel(locale, total)}
            </p>
            <ProductSortSelect locale={locale} basePath={basePath} params={currentParams} />
          </div>

          {/* Both empty states offer a way onward, not just the filtered one:
              a landing page is somewhere a customer arrives directly, so an
              empty category with nothing to clear is otherwise a dead end. */}
          {products.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center">
              <p className="text-[15px] font-medium text-neutral-900">
                {filtersApplied
                  ? pickLocale(
                      locale,
                      "Nothing matches these filters.",
                      "چیزی با این فیلترها پیدا نشد.",
                    )
                  : pickLocale(
                      locale,
                      "Nothing is listed in this category yet.",
                      "هنوز محصولی در این دسته‌بندی ثبت نشده است.",
                    )}
              </p>
              <Link
                href={
                  filtersApplied
                    ? buildProductListHref(basePath, clearProductFilters(currentParams))
                    : buildProductListHref(navHref(locale, PRODUCTS_PATH), {
                        fit: currentParams.fit,
                      })
                }
                className="focus-visible:ring-accent text-accent mt-3 inline-flex min-h-11 items-center rounded text-[13.5px] font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {filtersApplied
                  ? pickLocale(locale, "Clear all filters", "پاک کردن همه‌ی فیلترها")
                  : pickLocale(locale, "Browse all products", "مشاهده‌ی همه‌ی محصولات")}
              </Link>
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

// generateMetadata and the page both need the row, and Prisma has no
// per-request dedupe of its own — `cache` keeps it to one query.
const findCategory = cache(async (slug: string) => {
  const parsed = storefrontCategorySlugParamSchema.safeParse(slug);
  // A segment that can't be a slug can't match a row either; skip the query.
  if (!parsed.success) return null;
  return getStorefrontCategoryBySlug(parsed.data);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await findCategory(slug);
  // The page 404s; there's nothing to describe.
  if (!category) return {};

  // The admin's meta pair is optional, so the category's own name and short
  // description stand in — an unoptimised <title> beats a blank one.
  return {
    // Same slug in both trees (Design Decision 2). The canonical drops the
    // filter and page params: those narrow this listing, they don't make a
    // second one.
    alternates: localeAlternates(locale, `${CATEGORIES_PATH}/${category.slug}`),
    title: firstFilled(
      pickLocale(locale, category.metaTitleEn, category.metaTitleFa),
      pickLocale(locale, category.nameEn, category.nameFa),
    ),
    description: firstFilled(
      pickLocale(locale, category.metaDescriptionEn, category.metaDescriptionFa),
      pickLocale(locale, category.shortDescriptionEn, category.shortDescriptionFa),
    ),
  };
}
