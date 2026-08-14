-- Storefront display order for categories. Nullable, and left NULL for every
-- existing row: NULL means "unordered", which the storefront query sorts last
-- and alphabetically, so the catalog reads exactly as it did before.
-- No index: the table holds a handful of rows and is read whole.
ALTER TABLE "Category" ADD COLUMN     "sortOrder" INTEGER;
