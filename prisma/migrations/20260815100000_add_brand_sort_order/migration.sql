-- Storefront display order for brands. Nullable, and left NULL for every
-- existing row: NULL means "unordered", which the storefront query sorts last
-- and alphabetically, so the brand rails read exactly as they did before.
-- No index: the table holds a handful of rows and is read whole.
ALTER TABLE "Brand" ADD COLUMN     "sortOrder" INTEGER;
