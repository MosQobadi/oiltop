-- DropForeignKey
ALTER TABLE "FitmentRecommendation" DROP CONSTRAINT "FitmentRecommendation_carEngineId_fkey";

-- DropForeignKey
ALTER TABLE "FitmentRecommendation" DROP CONSTRAINT "FitmentRecommendation_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "FitmentRecommendation" DROP CONSTRAINT "FitmentRecommendation_productId_fkey";

-- DropTable
DROP TABLE "FitmentRecommendation";

