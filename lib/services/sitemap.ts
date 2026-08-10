import { prisma } from "@/lib/db";

// The four crawlable resource types, reduced to the only two things a sitemap
// entry needs: the slug that forms its URL and the timestamp that goes in
// <lastmod>. Deliberately its own file rather than four more selects bolted
// onto lib/services/catalog and lib/services/fitment — those shape rows for
// rendering, this one shapes rows for a crawler, and the visibility rules are
// the part worth keeping side by side.
//
// Every query mirrors the visibility rule of the page it points at: a URL in
// the sitemap that answers 404 is worse than an absent one, so "active" here
// means the same walk up the parent chain that the page itself performs
// (getStorefrontProductBySlug, getActiveCarModelById).

export interface SitemapResource {
  slug: string;
  updatedAt: Date;
}

export interface SitemapCarModel extends SitemapResource {
  brandSlug: string;
}

export async function listSitemapProducts(): Promise<SitemapResource[]> {
  return prisma.product.findMany({
    where: {
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });
}

export async function listSitemapCategories(): Promise<SitemapResource[]> {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });
}

export async function listSitemapCarBrands(): Promise<SitemapResource[]> {
  return prisma.carBrand.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });
}

// A model's slug is only unique within its brand (`@@unique([carBrandId, slug])`),
// so the brand slug travels with it — it's half the URL, not a label.
export async function listSitemapCarModels(): Promise<SitemapCarModel[]> {
  const models = await prisma.carModel.findMany({
    where: { status: "ACTIVE", carBrand: { status: "ACTIVE" } },
    select: { slug: true, updatedAt: true, carBrand: { select: { slug: true } } },
    orderBy: [{ carBrand: { slug: "asc" } }, { slug: "asc" }],
  });

  return models.map(({ slug, updatedAt, carBrand }) => ({
    slug,
    updatedAt,
    brandSlug: carBrand.slug,
  }));
}
