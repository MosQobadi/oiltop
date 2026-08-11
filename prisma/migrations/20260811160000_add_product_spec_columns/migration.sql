-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "apiGrade" TEXT,
ADD COLUMN     "specs" JSONB,
ADD COLUMN     "viscosity" TEXT,
ADD COLUMN     "volumeMl" INTEGER;
