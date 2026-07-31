-- CreateTable
CREATE TABLE "FitmentProfile" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitmentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitmentProfileItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "climate" "FitmentClimate" NOT NULL DEFAULT 'STANDARD',
    "productId" TEXT,
    "specNote" TEXT,
    "specAttributes" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitmentProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarEngineFitmentProfile" (
    "id" TEXT NOT NULL,
    "carEngineId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarEngineFitmentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarEngineFitmentProfile_carEngineId_profileId_key" ON "CarEngineFitmentProfile"("carEngineId", "profileId");

-- AddForeignKey
ALTER TABLE "FitmentProfileItem" ADD CONSTRAINT "FitmentProfileItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FitmentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitmentProfileItem" ADD CONSTRAINT "FitmentProfileItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitmentProfileItem" ADD CONSTRAINT "FitmentProfileItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarEngineFitmentProfile" ADD CONSTRAINT "CarEngineFitmentProfile_carEngineId_fkey" FOREIGN KEY ("carEngineId") REFERENCES "CarEngine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarEngineFitmentProfile" ADD CONSTRAINT "CarEngineFitmentProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FitmentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
