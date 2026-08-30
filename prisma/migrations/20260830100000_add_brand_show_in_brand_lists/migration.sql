-- Splits "this brand's products are purchasable" (status) from "this brand is
-- merchandised as a brand" (showInBrandLists). The import creates a Brand per
-- source label, and for OEM parts that label is the car the part fits — so the
-- table holds car makes and models that must stay ACTIVE for their products to
-- sell, but must not appear on the storefront's brand wall or filter rails.
--
-- Defaults true so every existing row keeps behaving exactly as it does today;
-- scripts/classify-brand-lists.ts is what turns the car-derived ones off.
-- No index: the table holds ~150 rows and is read whole.
ALTER TABLE "Brand" ADD COLUMN     "showInBrandLists" BOOLEAN NOT NULL DEFAULT true;
