import type { MetadataRoute } from "next";
import { absoluteUrl, disallowedPaths } from "@/lib/storefront/sitemap";
import { isSitemapEnabled } from "@/server/setting";

// /robots.txt. Everything the storefront renders is crawlable except the
// transactional funnel and the account area — see `PRIVATE_PATHS`.

// Reads the same Settings toggle as the sitemap, so it can't advertise a
// sitemap that has been switched off.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemapEnabled = await isSitemapEnabled();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: disallowedPaths(),
    },
    ...(sitemapEnabled ? { sitemap: absoluteUrl("/sitemap.xml") } : {}),
  };
}
