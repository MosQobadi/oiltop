-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "CarBrand" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "CarModel" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Brand_sourceRef_key" ON "Brand"("sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "CarBrand_sourceRef_key" ON "CarBrand"("sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "CarModel_sourceRef_key" ON "CarModel"("sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sourceRef_key" ON "Product"("sourceRef");
