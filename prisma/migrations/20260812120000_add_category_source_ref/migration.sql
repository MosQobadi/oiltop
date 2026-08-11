-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_sourceRef_key" ON "Category"("sourceRef");
