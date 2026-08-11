-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "variantGroup" TEXT;

-- CreateIndex
CREATE INDEX "Product_variantGroup_idx" ON "Product"("variantGroup");
