import type { Metadata } from "next";
import { BrandBrowseSection } from "@/components/storefront/home/BrandBrowseSection";
import { CategoryBrowseSection } from "@/components/storefront/home/CategoryBrowseSection";
import { DealsCarousel } from "@/components/storefront/home/DealsCarousel";
import { HomeHero } from "@/components/storefront/home/HomeHero";
import { TrustStrip } from "@/components/storefront/home/TrustStrip";
import { type Locale } from "@/lib/i18n";
import {
  listActiveCategories,
  listActiveProductBrands,
  listStorefrontDeals,
} from "@/lib/services/catalog";
import { localeAlternates } from "@/lib/storefront/seo";
import { getPublicSettings } from "@/server/setting";

// The homepage is the car-finder with a sentence of context around it: the
// wizard is the product's headline interaction, so it sits in the hero itself
// rather than below a marketing block a customer has to scroll past.
//
// Five sections, in the order a customer decides things: find my car, take an
// offer, browse by category, browse by brand, reach a human. The deals rail sits
// directly under the hero because it's the only section that can be shopped
// without knowing anything about your car.
//
// Data is read through the service layer directly rather than through this app's
// own /api/storefront routes, the same as app/[locale]/fitment/page.tsx and the
// layout's Settings read: same functions those routes serve, minus an HTTP
// round-trip to ourselves.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // The site root of each tree — the path is empty, the pair is still `/en` and
  // `/fa` naming each other.
  return { alternates: localeAlternates(locale, "") };
}

export default async function StorefrontHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const [categories, brands, deals, settings] = await Promise.all([
    listActiveCategories(),
    listActiveProductBrands(),
    listStorefrontDeals(),
    getPublicSettings(),
  ]);

  return (
    <>
      <HomeHero locale={locale} categories={categories} />

      {/* An empty rail is worse than no rail — a shop with nothing on offer
          shouldn't announce it. */}
      {deals.length > 0 && <DealsCarousel locale={locale} products={deals} />}

      <CategoryBrowseSection locale={locale} categories={categories} />

      <BrandBrowseSection locale={locale} brands={brands} />

      <TrustStrip locale={locale} settings={settings} />
    </>
  );
}
