-- AlterTable: Product.slug is NOT NULL UNIQUE, so it is added nullable,
-- backfilled from existing data, then tightened. The backfill mirrors
-- lib/slug.ts' slugify(): lowercase, non-alphanumerics collapsed to a single
-- hyphen, leading/trailing hyphens trimmed.
ALTER TABLE "Product" ADD COLUMN "slug" TEXT;

UPDATE "Product"
SET "slug" = trim(both '-' from regexp_replace(lower("nameEn"), '[^a-z0-9]+', '-', 'g'));

-- A nameEn with no ASCII alphanumerics slugifies to an empty string; SKU is
-- already unique, so it is the safe fallback.
UPDATE "Product"
SET "slug" = trim(both '-' from regexp_replace(lower("sku"), '[^a-z0-9]+', '-', 'g'))
WHERE "slug" IS NULL OR "slug" = '';

-- Two products can legitimately share an English name (different pack sizes,
-- say). Suffix every member of a colliding group with its SKU rather than
-- picking a winner.
UPDATE "Product" p
SET "slug" =
  p."slug" || '-' || trim(both '-' from regexp_replace(lower(p."sku"), '[^a-z0-9]+', '-', 'g'))
FROM (
  SELECT "slug" FROM "Product" GROUP BY "slug" HAVING count(*) > 1
) AS duplicates
WHERE p."slug" = duplicates."slug";

ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateTable
CREATE TABLE "StockNotification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockNotification_productId_notifiedAt_idx" ON "StockNotification"("productId", "notifiedAt");

-- AddForeignKey
ALTER TABLE "StockNotification" ADD CONSTRAINT "StockNotification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
