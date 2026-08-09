-- AlterTable: storefront customers register with a phone number and may never
-- give an email (Design Decision 7), so the column becomes nullable. The
-- unique index is kept — Postgres allows multiple NULLs in a unique index — and
-- the "ADMIN must have an email" rule lives in Zod, not here.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProductPriceLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPriceLog_productId_changedAt_idx" ON "ProductPriceLog"("productId", "changedAt");

-- AddForeignKey
ALTER TABLE "ProductPriceLog" ADD CONSTRAINT "ProductPriceLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
