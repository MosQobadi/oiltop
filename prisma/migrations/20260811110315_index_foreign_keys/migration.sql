-- CreateIndex
CREATE INDEX "CarEngine_carModelId_idx" ON "CarEngine"("carModelId");

-- CreateIndex
CREATE INDEX "CarEngineFitmentProfile_profileId_idx" ON "CarEngineFitmentProfile"("profileId");

-- CreateIndex
CREATE INDEX "CarModel_carBrandId_idx" ON "CarModel"("carBrandId");

-- CreateIndex
CREATE INDEX "FitmentInquiry_carEngineId_idx" ON "FitmentInquiry"("carEngineId");

-- CreateIndex
CREATE INDEX "FitmentInquiry_categoryId_idx" ON "FitmentInquiry"("categoryId");

-- CreateIndex
CREATE INDEX "FitmentProfileItem_profileId_idx" ON "FitmentProfileItem"("profileId");

-- CreateIndex
CREATE INDEX "FitmentProfileItem_categoryId_idx" ON "FitmentProfileItem"("categoryId");

-- CreateIndex
CREATE INDEX "FitmentProfileItem_productId_idx" ON "FitmentProfileItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");
