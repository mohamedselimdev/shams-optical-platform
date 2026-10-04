-- AlterTable
ALTER TABLE "product" ADD COLUMN     "minPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "salesCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "product_status_minPrice_idx" ON "product"("status", "minPrice");
