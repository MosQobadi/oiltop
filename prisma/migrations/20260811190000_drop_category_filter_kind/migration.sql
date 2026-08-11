-- Category.filterKind was 1:1 with the category itself (oil-filter <-> OIL_FILTER,
-- four for four), so it was a second source of truth for the same fact — and the
-- one that could drift. Everything that filtered on it now filters by category.
ALTER TABLE "Category" DROP COLUMN "filterKind";

DROP TYPE "FilterKind";
