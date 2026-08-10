import type { MetadataRoute } from "next";
import {
  listSitemapCarBrands,
  listSitemapCarModels,
  listSitemapCategories,
  listSitemapProducts,
} from "@/lib/services/sitemap";
import {
  carBrandPath,
  carModelPath,
  categoryPath,
  localizedEntries,
  productPath,
  STATIC_SITEMAP_PATHS,
} from "@/lib/storefront/sitemap";
import { isSitemapEnabled } from "@/server/setting";

// /sitemap.xml. Sits at the app root rather than under `[locale]` on purpose:
// one file lists both language trees, which is what lets each URL point at its
// counterpart (see `localizedEntries`). A locale-scoped sitemap would be two
// files that can't reference each other.
//
// Car brand and model URLs are emitted here per admin Design Decision 7 — car
// pages are SEO pages, not just wizard steps. The two screens under
// `app/[locale]/cars/` (Task 10.3) 404 on exactly the rows the two queries
// below leave out, so no entry here points at a page that won't answer 200.

// Catalog rows and the Settings toggle both change without a deploy, so the
// sitemap is rendered per request rather than baked at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // An empty sitemap rather than a 404: the toggle means "don't advertise the
  // catalog", and a valid empty document says that unambiguously to a crawler
  // that already has the URL bookmarked. robots.txt stops linking to it too.
  if (!(await isSitemapEnabled())) return [];

  const [products, categories, carBrands, carModels] = await Promise.all([
    listSitemapProducts(),
    listSitemapCategories(),
    listSitemapCarBrands(),
    listSitemapCarModels(),
  ]);

  return [
    ...STATIC_SITEMAP_PATHS.flatMap((path) =>
      localizedEntries((locale) => `/${locale}${path}`, {
        changeFrequency: "daily",
        // The home page and the two entry points into the catalog outrank any
        // single product.
        priority: 1,
      }),
    ),
    ...categories.flatMap((category) =>
      localizedEntries((locale) => categoryPath(locale, category.slug), {
        lastModified: category.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    ),
    ...carBrands.flatMap((brand) =>
      localizedEntries((locale) => carBrandPath(locale, brand.slug), {
        lastModified: brand.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      }),
    ),
    ...carModels.flatMap((model) =>
      localizedEntries((locale) => carModelPath(locale, model.brandSlug, model.slug), {
        lastModified: model.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      }),
    ),
    ...products.flatMap((product) =>
      localizedEntries((locale) => productPath(locale, product.slug), {
        lastModified: product.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ),
  ];
}
