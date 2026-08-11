-- Stored final price, so the storefront's price sort can be done by the
-- database instead of in Node. Written as raw SQL because Prisma cannot express
-- a generated column: the schema maps it as a read-only field.
--
-- STORED (not VIRTUAL — Postgres 16 has no VIRTUAL) so the index below has a
-- real value to point at; the expression is the same one read-time code uses,
-- and Postgres recomputes it on every write to price/discountPercent.
ALTER TABLE "Product"
ADD COLUMN "finalPrice" DECIMAL(65,30) NOT NULL
GENERATED ALWAYS AS ("price" * (1 - "discountPercent" / 100.0)) STORED;

-- The point of the column: ORDER BY "finalPrice" on the PLP.
CREATE INDEX "Product_finalPrice_idx" ON "Product"("finalPrice");
